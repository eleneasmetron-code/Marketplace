'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['sites', 'design', 'ads', 'bots', 'automation', 'texts', 'presentations', 'analytics', 'other'];
const CATEGORY_LABELS = {
  sites: 'Сайты', design: 'Дизайн', ads: 'Реклама', bots: 'Боты',
  automation: 'Автоматизация', texts: 'Тексты', presentations: 'Презентации',
  analytics: 'Аналитика', other: 'Другое'
};

// GET /api/tasks/categories
router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES.map(id => ({ id, label: CATEGORY_LABELS[id] })) });
});

// POST /api/tasks — create task (client only)
router.post('/', authenticate, requireRole('client'), (req, res) => {
  const db = getDb();
  const {
    title, description, expected_result = '', category, budget = 0,
    budget_type = 'fixed', deadline = '', urgency = 'normal',
    remote_allowed = 1, required_skills = [], files = [], links = [],
    status = 'draft'
  } = req.body;

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Заполните обязательные поля: название, описание, категория' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Неверная категория' });
  }

  const allowedStatuses = ['draft', 'published'];
  const finalStatus = allowedStatuses.includes(status) ? status : 'draft';

  const result = db.prepare(`
    INSERT INTO tasks (title, description, expected_result, category, budget, budget_type,
      deadline, urgency, remote_allowed, required_skills, files, links, status, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description, expected_result, category, budget, budget_type,
    deadline, urgency, remote_allowed ? 1 : 0,
    JSON.stringify(required_skills), JSON.stringify(files), JSON.stringify(links),
    finalStatus, req.user.id
  );

  // Update user task count
  db.prepare('UPDATE users SET task_count = task_count + 1 WHERE id = ?').run(req.user.id);

  // Log action
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'task_created', 'task', result.lastInsertRowid, title);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// GET /api/tasks — list tasks with filters
router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const {
    category, budget_min, budget_max, deadline, urgency,
    no_offers, remote, skill, search, status = 'published',
    sort = 'newest', page = 1, limit = 20
  } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  // Status filter
  if (status === 'all') {
    where += " AND t.status NOT IN ('draft', 'hidden')";
  } else if (status === 'open') {
    where += " AND t.status IN ('published')";
  } else {
    const statuses = status.split(',');
    where += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  if (category && category !== 'all') {
    where += ' AND t.category = ?';
    params.push(category);
  }
  if (budget_min) {
    where += ' AND t.budget >= ?';
    params.push(Number(budget_min));
  }
  if (budget_max) {
    where += ' AND t.budget <= ?';
    params.push(Number(budget_max));
  }
  if (deadline) {
    where += ' AND t.deadline <= ?';
    params.push(deadline);
  }
  if (urgency && urgency !== 'all') {
    where += ' AND t.urgency = ?';
    params.push(urgency);
  }
  if (remote) {
    where += ' AND t.remote_allowed = 1';
  }
  if (search) {
    where += ' AND (t.title LIKE ? COLLATE NOCASE OR t.description LIKE ? COLLATE NOCASE)';
    params.push(`%${search}%`, `%${search}%`);
  }

  let orderBy;
  switch (sort) {
    case 'budget_desc': orderBy = 't.budget DESC'; break;
    case 'budget_asc': orderBy = 't.budget ASC'; break;
    case 'deadline': orderBy = 't.deadline ASC'; break;
    case 'least_offers': orderBy = 'offer_count ASC'; break;
    default: orderBy = 't.created_at DESC';
  }

  const offset = (Number(page) - 1) * Number(limit);

  const sql = `
    SELECT t.*,
      u.name as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM offers WHERE task_id = t.id) as offer_count
    FROM tasks t
    JOIN users u ON t.creator_id = u.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  params.push(Number(limit), offset);

  const tasks = db.prepare(sql).all(...params);

  // Parse JSON fields and filter by skill
  let result = tasks.map(t => ({
    ...t,
    required_skills: JSON.parse(t.required_skills || '[]'),
    files: JSON.parse(t.files || '[]'),
    links: JSON.parse(t.links || '[]')
  }));

  if (skill) {
    result = result.filter(t =>
      t.required_skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
    );
  }

  if (no_offers) {
    result = result.filter(t => t.offer_count === 0);
  }

  // Count total
  const countParams = params.slice(0, params.length - 2);
  const countSql = `SELECT COUNT(*) as total FROM tasks t JOIN users u ON t.creator_id = u.id ${where}`;
  const { total } = db.prepare(countSql).get(...countParams);

  res.json({ tasks: result, total, page: Number(page), limit: Number(limit) });
});

// GET /api/tasks/my/list — current user's tasks
router.get('/my/list', authenticate, (req, res) => {
  const db = getDb();
  const { filter = 'all' } = req.query;

  let where;
  if (req.user.role === 'client') {
    where = 'WHERE t.creator_id = ?';
  } else if (req.user.role === 'performer') {
    where = 'WHERE t.assigned_to = ?';
  } else {
    where = 'WHERE 1=0';
  }
  const params = [req.user.id];

  if (filter !== 'all') {
    where += ' AND t.status = ?';
    params.push(filter);
  }

  const tasks = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM offers WHERE task_id = t.id) as offer_count
    FROM tasks t ${where}
    ORDER BY t.updated_at DESC
  `).all(...params);

  res.json({ tasks: tasks.map(t => ({ ...t, required_skills: JSON.parse(t.required_skills || '[]') })) });
});

// GET /api/tasks/:id — task details with offers
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*, u.name as creator_name, u.avatar as creator_avatar,
           u.city as creator_city, u.country as creator_country,
           u.rating as creator_rating, u.completed_count as creator_completed
    FROM tasks t
    JOIN users u ON t.creator_id = u.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Задача не найдена' });
  }

  // Hide hidden tasks from non-owners and non-admins
  if (task.status === 'hidden') {
    if (!req.user || (req.user.id !== task.creator_id && req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
  }

  task.required_skills = JSON.parse(task.required_skills || '[]');
  task.files = JSON.parse(task.files || '[]');
  task.links = JSON.parse(task.links || '[]');

  // Get offers
  const offers = db.prepare(`
    SELECT o.*, u.name as performer_name, u.avatar as performer_avatar,
           u.rating as performer_rating, u.completed_count as performer_completed
    FROM offers o
    JOIN users u ON o.performer_id = u.id
    WHERE o.task_id = ?
    ORDER BY o.created_at DESC
  `).all(task.id);

  task.offers = offers;
  task.offer_count = offers.length;

  // Check if current user has already offered
  if (req.user && req.user.role === 'performer') {
    const myOffer = offers.find(o => o.performer_id === req.user.id);
    task.my_offer = myOffer || null;
  }

  // If task is assigned, include assigned performer info
  if (task.assigned_to) {
    const assignee = db.prepare('SELECT id, name, avatar, rating FROM users WHERE id = ?').get(task.assigned_to);
    task.assigned_user = assignee;
  }

  res.json(task);
});

// PUT /api/tasks/:id — update task (creator only)
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Задача не найдена' });
  }
  if (task.creator_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет прав для редактирования' });
  }
  if (['completed', 'cancelled', 'archived'].includes(task.status)) {
    return res.status(400).json({ error: 'Нельзя редактировать завершённую задачу' });
  }

  const {
    title, description, expected_result, category, budget, budget_type,
    deadline, urgency, remote_allowed, required_skills, files, links, status
  } = req.body;

  const allowedStatuses = ['draft', 'published', 'cancelled'];
  const finalStatus = status && allowedStatuses.includes(status) ? status : undefined;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      expected_result = COALESCE(?, expected_result),
      category = COALESCE(?, category),
      budget = COALESCE(?, budget),
      budget_type = COALESCE(?, budget_type),
      deadline = COALESCE(?, deadline),
      urgency = COALESCE(?, urgency),
      remote_allowed = COALESCE(?, remote_allowed),
      required_skills = COALESCE(?, required_skills),
      files = COALESCE(?, files),
      links = COALESCE(?, links),
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title, description, expected_result, category, budget, budget_type,
    deadline, urgency, remote_allowed !== undefined ? (remote_allowed ? 1 : 0) : null,
    required_skills ? JSON.stringify(required_skills) : null,
    files ? JSON.stringify(files) : null,
    links ? JSON.stringify(links) : null,
    finalStatus || null,
    task.id
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);
});

// PUT /api/tasks/:id/choose — choose performer (client only)
router.put('/:id/choose', authenticate, requireRole('client'), (req, res) => {
  const db = getDb();
  const { offer_id } = req.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (task.creator_id !== req.user.id) return res.status(403).json({ error: 'Это не ваша задача' });
  if (task.status !== 'published') return res.status(400).json({ error: 'Задача уже не принимает отклики' });

  const offer = db.prepare('SELECT * FROM offers WHERE id = ? AND task_id = ?').get(offer_id, task.id);
  if (!offer) return res.status(404).json({ error: 'Отклик не найден' });

  // Update task status
  db.prepare("UPDATE tasks SET status = 'assigned', assigned_to = ?, updated_at = datetime('now') WHERE id = ?")
    .run(offer.performer_id, task.id);

  // Accept this offer, reject others
  db.prepare("UPDATE offers SET status = 'accepted' WHERE id = ?").run(offer.id);
  db.prepare("UPDATE offers SET status = 'rejected' WHERE task_id = ? AND id != ?").run(task.id, offer.id);

  // Notify performer
  db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
    .run(offer.performer_id, 'offer_accepted', JSON.stringify({
      task_id: task.id, task_title: task.title, message: `Ваш отклик на задачу "${task.title}" принят!`
    }));

  // Notify other performers
  const rejectedOffers = db.prepare('SELECT performer_id FROM offers WHERE task_id = ? AND id != ?').all(task.id, offer.id);
  for (const ro of rejectedOffers) {
    db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
      .run(ro.performer_id, 'offer_rejected', JSON.stringify({
        task_id: task.id, task_title: task.title, message: `Ваш отклик на задачу "${task.title}" отклонён.`
      }));
  }

  // Log
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'performer_chosen', 'task', task.id, `Chosen performer ${offer.performer_id}`);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);
});

// PUT /api/tasks/:id/status — change task status
router.put('/:id/status', authenticate, (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  // Validate transitions
  const transitions = {
    'assigned': ['in_progress', 'cancelled'],
    'in_progress': ['review', 'completed', 'cancelled'],
    'review': ['completed', 'in_progress'],
    'published': ['cancelled', 'moderation'],
    'moderation': ['published', 'hidden'],
  };

  const isCreator = task.creator_id === req.user.id;
  const isAssigned = task.assigned_to === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isCreator && !isAssigned && !isAdmin) {
    return res.status(403).json({ error: 'Нет прав' });
  }

  const allowed = transitions[task.status] || [];
  if (!allowed.includes(status) && !isAdmin) {
    return res.status(400).json({ error: `Недопустимый переход: ${task.status} → ${status}` });
  }

  // Role-based transition checks
  if (task.status === 'in_progress' && status === 'review' && !isAssigned && !isAdmin) {
    return res.status(403).json({ error: 'Только назначенный исполнитель может отправить на проверку' });
  }
  if (task.status === 'review' && status === 'in_progress' && !isCreator && !isAdmin) {
    return res.status(403).json({ error: 'Только заказчик может вернуть на доработку' });
  }
  if (task.status === 'review' && status === 'completed' && !isCreator && !isAdmin) {
    return res.status(403).json({ error: 'Только заказчик может принять работу' });
  }
  if (task.status === 'published' && status === 'moderation' && !isAdmin) {
    return res.status(403).json({ error: 'Только администратор может отправить на модерацию' });
  }
  if (task.status === 'moderation' && !isAdmin) {
    return res.status(403).json({ error: 'Только администратор может изменить статус модерации' });
  }

  db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, task.id);

  // Notify relevant parties
  if (status === 'completed') {
    if (isAssigned) {
      db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
        .run(task.creator_id, 'task_ready', JSON.stringify({
          task_id: task.id, task_title: task.title, message: `Исполнитель отметил задачу "${task.title}" как готовую.`
        }));
    }
    // Update completed counts
    if (task.assigned_to) {
      db.prepare('UPDATE users SET completed_count = completed_count + 1 WHERE id = ?').run(task.assigned_to);
    }
    db.prepare('UPDATE users SET completed_count = completed_count + 1 WHERE id = ?').run(task.creator_id);
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  res.json(updated);
});

module.exports = router;
