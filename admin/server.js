'use strict';

require('dotenv').config({ path: '../.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(__dirname, '..', process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'data.db');

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Database ─────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure reviews table has hidden column
const reviewCols = db.prepare("PRAGMA table_info(reviews)").all().map(c => c.name);
if (!reviewCols.includes('hidden')) {
  db.exec("ALTER TABLE reviews ADD COLUMN hidden INTEGER DEFAULT 0");
}

// Ensure tasks table has hidden column
const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
if (!taskCols.includes('hidden')) {
  db.exec("ALTER TABLE tasks ADD COLUMN hidden INTEGER DEFAULT 0");
}

// ─── Auth middleware ───────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Нет токена авторизации' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function logAction(adminId, action, targetType, targetId, details) {
  db.prepare(
    "INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, timestamp) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(adminId, action, targetType || '', targetId || 0, details || '');
}

// ─── AUTH ROUTES ──────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Неверные учётные данные' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администраторов' });
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверные учётные данные' });
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      token,
      admin: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DASHBOARD ────────────────────────────────────────────────
app.get('/api/admin/stats', authRequired, (req, res) => {
  try {
    const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
    const totalTasks = db.prepare("SELECT COUNT(*) as c FROM tasks").get().c;
    const totalOffers = db.prepare("SELECT COUNT(*) as c FROM offers").get().c;
    const totalReviews = db.prepare("SELECT COUNT(*) as c FROM reviews").get().c;
    const totalReports = db.prepare("SELECT COUNT(*) as c FROM reports WHERE status != 'closed'").get().c;
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'completed'").get().c;

    const revenue = db.prepare(
      "SELECT COALESCE(SUM(budget), 0) as total FROM tasks WHERE status = 'completed'"
    ).get().total;

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const newUsersWeek = db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE created_at >= ?"
    ).get(weekAgo).c;

    const tasksByStatus = db.prepare(
      "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
    ).all();

    const recentActions = db.prepare(
      `SELECT aa.*, u.name as admin_name FROM admin_actions aa
       LEFT JOIN users u ON aa.admin_id = u.id
       ORDER BY aa.timestamp DESC LIMIT 20`
    ).all();

    const recentUsers = db.prepare(
      "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10"
    ).all();

    const recentTasks = db.prepare(
      `SELECT t.id, t.title, t.status, t.created_at, u.name as creator_name
       FROM tasks t LEFT JOIN users u ON t.creator_id = u.id
       ORDER BY t.created_at DESC LIMIT 10`
    ).all();

    res.json({
      totalUsers, totalTasks, totalOffers, totalReviews,
      totalReports, completedTasks, revenue, newUsersWeek,
      tasksByStatus, recentActions, recentUsers, recentTasks
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── USERS ────────────────────────────────────────────────────
app.get('/api/admin/users', authRequired, (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (role && role !== 'all') { where += " AND u.role = ?"; params.push(role); }
    if (status === 'blocked') { where += " AND u.blocked = 1"; }
    if (status === 'active') { where += " AND u.blocked = 0"; }
    if (search) { where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.city LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const total = db.prepare("SELECT COUNT(*) as c FROM users u " + where).get(...params).c;

    let sql = "SELECT u.*, pp.specialization, pp.skills, pp.experience, pp.hourly_rate, pp.availability FROM users u LEFT JOIN performer_profiles pp ON pp.user_id = u.id " + where;
    sql += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const users = db.prepare(sql).all(...params);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users/:id', authRequired, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    delete user.password_hash;
    const profile = db.prepare('SELECT * FROM performer_profiles WHERE user_id = ?').get(req.params.id);
    const userTasks = db.prepare("SELECT id, title, status, created_at FROM tasks WHERE creator_id = ? ORDER BY created_at DESC LIMIT 20").all(req.params.id);
    const userOffers = db.prepare("SELECT o.*, t.title as task_title FROM offers o LEFT JOIN tasks t ON o.task_id = t.id WHERE o.performer_id = ? ORDER BY o.created_at DESC LIMIT 20").all(req.params.id);
    res.json({ user, performer_profile: profile || null, tasks: userTasks, offers: userOffers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id', authRequired, (req, res) => {
  try {
    const { name, email, city, bio, role, blocked, country, website, contact } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    db.prepare(
      "UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), city = COALESCE(?, city), bio = COALESCE(?, bio), role = COALESCE(?, role), blocked = COALESCE(?, blocked), country = COALESCE(?, country), website = COALESCE(?, website), contact = COALESCE(?, contact) WHERE id = ?"
    ).run(name, email, city, bio, role, blocked, country, website, contact, req.params.id);

    logAction(req.admin.id, 'edit_user', 'user', req.params.id, `Редактирование: ${Object.keys(req.body).join(', ')}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id/block', authRequired, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const newBlocked = user.blocked ? 0 : 1;
    db.prepare("UPDATE users SET blocked = ? WHERE id = ?").run(newBlocked, req.params.id);
    logAction(req.admin.id, newBlocked ? 'block_user' : 'unblock_user', 'user', req.params.id, `${user.name} (${user.email})`);
    res.json({ success: true, blocked: !!newBlocked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id/role', authRequired, (req, res) => {
  try {
    const { role } = req.body;
    if (!['client', 'performer', 'admin'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
    logAction(req.admin.id, 'change_role', 'user', req.params.id, `${user.role} -> ${role} для ${user.name}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TASKS ────────────────────────────────────────────────────
app.get('/api/admin/tasks', authRequired, (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 20 } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (status && status !== 'all') { where += " AND t.status = ?"; params.push(status); }
    if (category && category !== 'all') { where += " AND t.category = ?"; params.push(category); }
    if (search) { where += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

    const total = db.prepare("SELECT COUNT(*) as c FROM tasks t " + where).get(...params).c;

    let sql = `SELECT t.*, u.name as creator_name,
      (SELECT COUNT(*) FROM offers WHERE task_id = t.id) as offers_count
      FROM tasks t LEFT JOIN users u ON t.creator_id = u.id ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, Number(limit), (Number(page) - 1) * Number(limit)];
    const tasks = db.prepare(sql).all(...queryParams);

    res.json({ tasks, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/tasks/:id', authRequired, (req, res) => {
  try {
    const task = db.prepare(
      `SELECT t.*, u.name as creator_name FROM tasks t LEFT JOIN users u ON t.creator_id = u.id WHERE t.id = ?`
    ).get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    const offers = db.prepare(
      `SELECT o.*, u.name as performer_name FROM offers o LEFT JOIN users u ON o.performer_id = u.id WHERE o.task_id = ? ORDER BY o.created_at DESC`
    ).all(req.params.id);

    const messages = db.prepare(
      `SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.task_id = ? ORDER BY m.created_at ASC`
    ).all(req.params.id);

    res.json({ task, offers, messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/tasks/:id', authRequired, (req, res) => {
  try {
    const { title, description, status, category, budget, urgency } = req.body;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    db.prepare(
      "UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), category = COALESCE(?, category), budget = COALESCE(?, budget), urgency = COALESCE(?, urgency), updated_at = datetime('now') WHERE id = ?"
    ).run(title, description, status, category, budget, urgency, req.params.id);

    logAction(req.admin.id, 'edit_task', 'task', req.params.id, `Редактирование: ${Object.keys(req.body).join(', ')}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/tasks/:id/status', authRequired, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft','published','moderation','hidden','assigned','in_progress','review','completed','cancelled','disputed','archived'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
    logAction(req.admin.id, 'change_task_status', 'task', req.params.id, `${task.status} -> ${status}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/tasks/:id/hide', authRequired, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    const newHidden = task.hidden ? 0 : 1;
    db.prepare("UPDATE tasks SET hidden = ?, updated_at = datetime('now') WHERE id = ?").run(newHidden, req.params.id);
    logAction(req.admin.id, newHidden ? 'hide_task' : 'show_task', 'task', req.params.id, task.title);
    res.json({ success: true, hidden: !!newHidden });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OFFERS ───────────────────────────────────────────────────
app.get('/api/admin/offers', authRequired, (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (status && status !== 'all') { where += " AND o.status = ?"; params.push(status); }

    const total = db.prepare("SELECT COUNT(*) as c FROM offers o " + where).get(...params).c;

    let sql = `SELECT o.*, t.title as task_title, u.name as performer_name
      FROM offers o
      LEFT JOIN tasks t ON o.task_id = t.id
      LEFT JOIN users u ON o.performer_id = u.id ${where}
      ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, Number(limit), (Number(page) - 1) * Number(limit)];
    const offers = db.prepare(sql).all(...queryParams);

    res.json({ offers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/offers/:id/status', authRequired, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['sent', 'viewed', 'shortlisted', 'accepted', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Отклик не найден' });
    db.prepare("UPDATE offers SET status = ? WHERE id = ?").run(status, req.params.id);
    logAction(req.admin.id, 'change_offer_status', 'offer', req.params.id, `${offer.status} -> ${status}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── REPORTS ──────────────────────────────────────────────────
app.get('/api/admin/reports', authRequired, (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (status && status !== 'all') { where += " AND r.status = ?"; params.push(status); }

    const total = db.prepare("SELECT COUNT(*) as c FROM reports r " + where).get(...params).c;

    let sql = `SELECT r.*, u.name as reporter_name FROM reports r LEFT JOIN users u ON r.reporter_id = u.id ${where}
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, Number(limit), (Number(page) - 1) * Number(limit)];
    const reports = db.prepare(sql).all(...queryParams);

    // Enrich with target info
    for (const r of reports) {
      if (r.target_type === 'task') {
        const t = db.prepare("SELECT title FROM tasks WHERE id = ?").get(r.target_id);
        r.target_title = t ? t.title : 'Удалено';
      } else if (r.target_type === 'user') {
        const u = db.prepare("SELECT name FROM users WHERE id = ?").get(r.target_id);
        r.target_title = u ? u.name : 'Удалено';
      } else if (r.target_type === 'offer') {
        const o = db.prepare("SELECT message FROM offers WHERE id = ?").get(r.target_id);
        r.target_title = o ? o.message.slice(0, 80) : 'Удалено';
      } else if (r.target_type === 'message') {
        const m = db.prepare("SELECT content FROM messages WHERE id = ?").get(r.target_id);
        r.target_title = m ? m.content.slice(0, 80) : 'Удалено';
      }
    }

    res.json({ reports, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/reports/:id/resolve', authRequired, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Жалоба не найдена' });
    db.prepare("UPDATE reports SET status = 'closed' WHERE id = ?").run(req.params.id);
    logAction(req.admin.id, 'resolve_report', 'report', req.params.id, `${report.target_type} #${report.target_id}: ${report.reason}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── REVIEWS ──────────────────────────────────────────────────
app.get('/api/admin/reviews', authRequired, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = db.prepare("SELECT COUNT(*) as c FROM reviews").get().c;
    const reviews = db.prepare(
      `SELECT r.*,
        rv.name as reviewer_name,
        re.name as reviewee_name,
        t.title as task_title
       FROM reviews r
       LEFT JOIN users rv ON r.reviewer_id = rv.id
       LEFT JOIN users re ON r.reviewee_id = re.id
       LEFT JOIN tasks t ON r.task_id = t.id
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
    ).all(Number(limit), (Number(page) - 1) * Number(limit));

    res.json({ reviews, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/reviews/:id/hidden', authRequired, (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
    const newHidden = review.hidden ? 0 : 1;
    db.prepare("UPDATE reviews SET hidden = ? WHERE id = ?").run(newHidden, req.params.id);
    logAction(req.admin.id, newHidden ? 'hide_review' : 'show_review', 'review', req.params.id, `Отзыв #${req.params.id}`);
    res.json({ success: true, hidden: !!newHidden });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CHATS ────────────────────────────────────────────────────
app.get('/api/admin/chats', authRequired, (req, res) => {
  try {
    const chats = db.prepare(
      `SELECT DISTINCT m.task_id,
        t.title as task_title,
        t.status as task_status,
        (SELECT COUNT(*) FROM messages WHERE task_id = m.task_id) as message_count,
        (SELECT MAX(created_at) FROM messages WHERE task_id = m.task_id) as last_message_at
       FROM messages m
       LEFT JOIN tasks t ON m.task_id = t.id
       ORDER BY last_message_at DESC`
    ).all();

    res.json({ chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/chats/:taskId', authRequired, (req, res) => {
  try {
    const messages = db.prepare(
      `SELECT m.*, u.name as sender_name, u.role as sender_role
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.task_id = ?
       ORDER BY m.created_at ASC`
    ).all(req.params.taskId);

    const task = db.prepare("SELECT id, title, status FROM tasks WHERE id = ?").get(req.params.taskId);
    res.json({ messages, task });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────
app.get('/api/admin/notifications', authRequired, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = db.prepare("SELECT COUNT(*) as c FROM notifications").get().c;
    const notifications = db.prepare(
      `SELECT n.*, u.name as user_name
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC LIMIT ? OFFSET ?`
    ).all(Number(limit), (Number(page) - 1) * Number(limit));

    res.json({ notifications, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/notifications/broadcast', authRequired, (req, res) => {
  try {
    const { message, type = 'system', userId } = req.body;
    if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

    const payload = JSON.stringify({ message, sent_by: req.admin.name });

    if (userId) {
      db.prepare(
        "INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(userId, type, payload);
    } else {
      const users = db.prepare("SELECT id FROM users").all();
      const insert = db.prepare(
        "INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, datetime('now'))"
      );
      const tx = db.transaction(() => {
        for (const u of users) {
          insert.run(u.id, type, payload);
        }
      });
      tx();
    }

    logAction(req.admin.id, 'broadcast_notification', 'notification', 0, userId ? `Пользователю #${userId}: ${message}` : `Всем: ${message}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ACTION LOG ───────────────────────────────────────────────
app.get('/api/admin/actions', authRequired, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = db.prepare("SELECT COUNT(*) as c FROM admin_actions").get().c;
    const actions = db.prepare(
      `SELECT aa.*, u.name as admin_name
       FROM admin_actions aa
       LEFT JOIN users u ON aa.admin_id = u.id
       ORDER BY aa.timestamp DESC LIMIT ? OFFSET ?`
    ).all(Number(limit), (Number(page) - 1) * Number(limit));

    res.json({ actions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SYSTEM INFO ──────────────────────────────────────────────
app.get('/api/admin/system', authRequired, (req, res) => {
  try {
    res.json({
      dbPath: DB_PATH,
      jwtStatus: 'Активен (24h expiry)',
      appVersion: '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
      dbSize: (() => {
        try {
          const fs = require('fs');
          const stats = fs.statSync(DB_PATH);
          return `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
        } catch { return 'N/A'; }
      })()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CATEGORIES LIST ──────────────────────────────────────────
app.get('/api/admin/categories', authRequired, (req, res) => {
  try {
    const cats = db.prepare("SELECT DISTINCT category FROM tasks WHERE category != '' ORDER BY category").all();
    res.json({ categories: cats.map(c => c.category) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FALLBACK: serve index.html for SPA routing ──────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TaskBridge Admin] Сервер запущен на http://localhost:${PORT}`);
  console.log(`[TaskBridge Admin] БД: ${DB_PATH}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
