'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth + admin
router.use(authenticate, requireAdmin);

// GET /api/admin/users
router.get('/users', (req, res) => {
  const db = getDb();
  const { role, blocked, search, page = 1, limit = 50 } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (role) { where += ' AND role = ?'; params.push(role); }
  if (blocked !== undefined) { where += ' AND blocked = ?'; params.push(Number(blocked)); }
  if (search) { where += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const users = db.prepare(`
    SELECT id, name, email, role, avatar, city, country, rating,
           task_count, completed_count, review_count, blocked, created_at
    FROM users ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  const countParams = params.slice(0, params.length - 2);
  const { total } = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...countParams);

  res.json({ users, total });
});

// PATCH /api/admin/users/:id — block/unblock user
router.patch('/users/:id', (req, res) => {
  const db = getDb();
  const { blocked } = req.body;
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.params.id);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Нельзя заблокировать себя' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Нельзя заблокировать администратора' });

  db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(blocked ? 1 : 0, user.id);

  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, blocked ? 'user_blocked' : 'user_unblocked', 'user', user.id, user.name);

  // Notify user
  db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
    .run(user.id, blocked ? 'blocked' : 'unblocked', JSON.stringify({
      message: blocked ? 'Ваш аккаунт заблокирован администрацией.' : 'Ваш аккаунт разблокирован.'
    }));

  res.json({ success: true, blocked: !!blocked });
});

// GET /api/admin/tasks
router.get('/tasks', (req, res) => {
  const db = getDb();
  const { status, category, search, page = 1, limit = 50 } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (status) { where += ' AND t.status = ?'; params.push(status); }
  if (category) { where += ' AND t.category = ?'; params.push(category); }
  if (search) { where += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const tasks = db.prepare(`
    SELECT t.*, u.name as creator_name,
           (SELECT COUNT(*) FROM offers WHERE task_id = t.id) as offer_count,
           (SELECT name FROM users WHERE id = t.assigned_to) as performer_name
    FROM tasks t
    JOIN users u ON t.creator_id = u.id
    ${where}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  res.json({ tasks });
});

// PATCH /api/admin/tasks/:id — hide/show, change status
router.patch('/tasks/:id', (req, res) => {
  const db = getDb();
  const { status, hidden } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  if (hidden !== undefined) {
    const newStatus = hidden ? 'hidden' : 'published';
    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, task.id);
    db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, hidden ? 'task_hidden' : 'task_shown', 'task', task.id, task.title);
  }

  if (status) {
    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, task.id);
    db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, 'task_status_changed', 'task', task.id, `${task.status} → ${status}`);
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);
});

// GET /api/admin/reports — list reports
router.get('/reports', (req, res) => {
  const db = getDb();
  const { status = 'new' } = req.query;

  const reports = db.prepare(`
    SELECT r.*, u.name as reporter_name,
           CASE
             WHEN r.target_type = 'task' THEN (SELECT title FROM tasks WHERE id = r.target_id)
             WHEN r.target_type = 'user' THEN (SELECT name FROM users WHERE id = r.target_id)
             ELSE ''
           END as target_label
    FROM reports r
    LEFT JOIN users u ON r.reporter_id = u.id
    WHERE r.status = ?
    ORDER BY r.created_at DESC
  `).all(status);

  res.json({ reports });
});

// PATCH /api/admin/reports/:id — resolve report
router.patch('/reports/:id', (req, res) => {
  const db = getDb();
  const { status, comment } = req.body;

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Жалоба не найдена' });

  db.prepare('UPDATE reports SET status = COALESCE(?, status), comment = COALESCE(?, comment) WHERE id = ?')
    .run(status, comment, report.id);

  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'report_resolved', 'report', report.id, `${report.reason} → ${status}`);

  res.json({ success: true });
});

// GET /api/admin/stats — dashboard statistics
router.get('/stats', (req, res) => {
  const db = getDb();

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalClients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'client'").get().count;
  const totalPerformers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'performer'").get().count;
  const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  const publishedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'published'").get().count;
  const completedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").get().count;
  const totalOffers = db.prepare('SELECT COUNT(*) as count FROM offers').get().count;
  const totalReports = db.prepare('SELECT COUNT(*) as count FROM reports').get().count;
  const openReports = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status != 'closed'").get().count;
  const blockedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE blocked = 1').get().count;

  const newThisWeek = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE created_at >= datetime('now', '-7 days')
  `).get().count;

  const recentActions = db.prepare(`
    SELECT aa.*, u.name as admin_name FROM admin_actions aa
    LEFT JOIN users u ON aa.admin_id = u.id
    ORDER BY aa.timestamp DESC LIMIT 20
  `).all();

  res.json({
    totalUsers, totalClients, totalPerformers,
    totalTasks, publishedTasks, completedTasks,
    totalOffers, totalReports, openReports,
    blockedUsers, newThisWeek, recentActions
  });
});

// GET /api/admin/offers — list all offers
router.get('/offers', (req, res) => {
  const db = getDb();
  const offers = db.prepare(`
    SELECT o.*, t.title as task_title,
           u1.name as performer_name, u2.name as client_name
    FROM offers o
    JOIN tasks t ON o.task_id = t.id
    JOIN users u1 ON o.performer_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    ORDER BY o.created_at DESC
    LIMIT 100
  `).all();

  res.json({ offers });
});

// GET /api/admin/reviews — list all reviews
router.get('/reviews', (req, res) => {
  const db = getDb();
  const reviews = db.prepare(`
    SELECT r.*, t.title as task_title,
           u1.name as reviewer_name, u2.name as reviewee_name
    FROM reviews r
    JOIN tasks t ON r.task_id = t.id
    JOIN users u1 ON r.reviewer_id = u1.id
    JOIN users u2 ON r.reviewee_id = u2.id
    ORDER BY r.created_at DESC
    LIMIT 100
  `).all();

  res.json({ reviews });
});

module.exports = router;
