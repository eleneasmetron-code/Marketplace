'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — user's notifications
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { unseen_only } = req.query;

  let where = 'WHERE user_id = ?';
  const params = [req.user.id];

  if (unseen_only) {
    where += ' AND seen = 0';
  }

  const notifications = db.prepare(`
    SELECT * FROM notifications ${where}
    ORDER BY created_at DESC
    LIMIT 50
  `).all(...params);

  const result = notifications.map(n => ({
    ...n,
    payload: JSON.parse(n.payload || '{}')
  }));

  res.json({ notifications: result });
});

// GET /api/notifications/unseen-count
router.get('/unseen-count', authenticate, (req, res) => {
  const db = getDb();
  const { count } = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND seen = 0'
  ).get(req.user.id);

  res.json({ count });
});

// PATCH /api/notifications/:id/seen — mark as seen
router.patch('/:id/seen', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET seen = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);

  res.json({ success: true });
});

// PATCH /api/notifications/seen-all — mark all as seen
router.patch('/seen-all', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET seen = 1 WHERE user_id = ? AND seen = 0')
    .run(req.user.id);

  res.json({ success: true });
});

module.exports = router;
