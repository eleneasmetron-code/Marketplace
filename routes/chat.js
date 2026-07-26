'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/chat/list — list user's active chats (MUST be before /:taskId)
router.get('/list', authenticate, (req, res) => {
  const db = getDb();

  const chats = db.prepare(`
    SELECT t.id as task_id, t.title, t.status,
           u1.name as client_name, u1.avatar as client_avatar,
           u2.name as performer_name, u2.avatar as performer_avatar,
           (SELECT content FROM messages WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT created_at FROM messages WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
           (SELECT COUNT(*) FROM messages WHERE task_id = t.id AND sender_id != ? AND read_at IS NULL) as unread_count
    FROM tasks t
    JOIN users u1 ON t.creator_id = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE (t.creator_id = ? OR t.assigned_to = ?)
      AND t.assigned_to IS NOT NULL
      AND t.status IN ('assigned', 'in_progress', 'review', 'completed')
    ORDER BY last_message_at DESC
  `).all(req.user.id, req.user.id, req.user.id);

  res.json({ chats });
});

// GET /api/chat/:taskId — get messages
router.get('/:taskId', authenticate, (req, res) => {
  const db = getDb();
  const taskId = Number(req.params.taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  // Only creator, assigned performer, or admin can access chat
  const isParticipant = task.creator_id === req.user.id || task.assigned_to === req.user.id;
  if (!isParticipant && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Чат доступен только участникам задачи' });
  }

  // Task must be assigned or later for chat to be available
  if (!['assigned', 'in_progress', 'review', 'completed'].includes(task.status)) {
    if (req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Чат доступен после выбора исполнителя' });
    }
  }

  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.role as sender_role
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.task_id = ?
    ORDER BY m.created_at ASC
  `).all(taskId);

  // Mark messages as read for this user
  db.prepare(`
    UPDATE messages SET read_at = datetime('now')
    WHERE task_id = ? AND sender_id != ? AND read_at IS NULL
  `).run(taskId, req.user.id);

  res.json({ messages, task_status: task.status });
});

// POST /api/tasks/:taskId/chat — send message
router.post('/:taskId', authenticate, (req, res) => {
  const db = getDb();
  const taskId = Number(req.params.taskId);
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  const isParticipant = task.creator_id === req.user.id || task.assigned_to === req.user.id;
  if (!isParticipant) {
    return res.status(403).json({ error: 'Только участники могут писать в чат' });
  }

  if (!['assigned', 'in_progress', 'review'].includes(task.status)) {
    return res.status(400).json({ error: 'Чат недоступен для текущего статуса задачи' });
  }

  const result = db.prepare(
    'INSERT INTO messages (task_id, sender_id, content) VALUES (?, ?, ?)'
  ).run(taskId, req.user.id, content.trim());

  const message = db.prepare(`
    SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.role as sender_role
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  // Notify the other participant
  const recipientId = req.user.id === task.creator_id ? task.assigned_to : task.creator_id;
  if (recipientId) {
    db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
      .run(recipientId, 'new_message', JSON.stringify({
        task_id: taskId,
        task_title: task.title,
        sender_name: req.user.name,
        preview: content.trim().slice(0, 100),
        message: `${req.user.name} написал в чат по задаче "${task.title}"`
      }));
  }

  res.status(201).json(message);
});

module.exports = router;
