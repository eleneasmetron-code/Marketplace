'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/tasks/:taskId/offers — create offer (performer only)
router.post('/:taskId/offers', authenticate, requireRole('performer'), (req, res) => {
  const db = getDb();
  const taskId = Number(req.params.taskId);
  const { message, price = 0, estimated_time = '', includes = '', questions = '', portfolio_link = '' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Добавьте сообщение к отклику' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (task.status !== 'published') return res.status(400).json({ error: 'Задача не принимает отклики' });
  if (task.creator_id === req.user.id) return res.status(400).json({ error: 'Нельзя откликнуться на свою задачу' });

  // Check if already offered
  const existing = db.prepare('SELECT id FROM offers WHERE task_id = ? AND performer_id = ?').get(taskId, req.user.id);
  if (existing) return res.status(409).json({ error: 'Вы уже откликнулись на эту задачу' });

  const result = db.prepare(`
    INSERT INTO offers (task_id, performer_id, message, price, estimated_time, includes, questions, portfolio_link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, req.user.id, message, price, estimated_time, includes, questions, portfolio_link);

  // Notify client
  db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
    .run(task.creator_id, 'new_offer', JSON.stringify({
      task_id: taskId,
      task_title: task.title,
      performer_id: req.user.id,
      performer_name: req.user.name,
      message: `${req.user.name} откликнулся на задачу "${task.title}"`
    }));

  // Log
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'offer_sent', 'task', taskId, `Offer by ${req.user.name}`);

  const offer = db.prepare(`
    SELECT o.*, u.name as performer_name, u.avatar as performer_avatar, u.rating as performer_rating
    FROM offers o JOIN users u ON o.performer_id = u.id
    WHERE o.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(offer);
});

// GET /api/offers/my — my offers (performer)
router.get('/my', authenticate, requireRole('performer'), (req, res) => {
  const db = getDb();
  const offers = db.prepare(`
    SELECT o.*, t.title as task_title, t.category, t.status as task_status, t.budget,
           u.name as client_name
    FROM offers o
    JOIN tasks t ON o.task_id = t.id
    JOIN users u ON t.creator_id = u.id
    WHERE o.performer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);

  res.json({ offers });
});

// GET /api/tasks/:taskId/offers — list offers for a task
router.get('/:taskId/offers', authenticate, (req, res) => {
  const db = getDb();
  const taskId = Number(req.params.taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (task.creator_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только заказчик может видеть отклики' });
  }

  const offers = db.prepare(`
    SELECT o.*, u.name as performer_name, u.avatar as performer_avatar,
           u.rating as performer_rating, u.completed_count as performer_completed,
           u.city as performer_city, u.country as performer_country
    FROM offers o
    JOIN users u ON o.performer_id = u.id
    WHERE o.task_id = ?
    ORDER BY o.created_at DESC
  `).all(taskId);

  // Mark offers as viewed
  db.prepare("UPDATE offers SET status = 'viewed' WHERE task_id = ? AND status = 'sent'").run(taskId);

  res.json({ offers });
});

module.exports = router;
