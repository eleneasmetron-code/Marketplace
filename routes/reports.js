'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/reports — create report
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { target_type, target_id, reason, comment = '' } = req.body;

  if (!target_type || !target_id || !reason) {
    return res.status(400).json({ error: 'Укажите тип, ID объекта и причину жалобы' });
  }
  if (!['task', 'user', 'message', 'offer'].includes(target_type)) {
    return res.status(400).json({ error: 'Неверный тип объекта' });
  }

  const result = db.prepare(`
    INSERT INTO reports (reporter_id, target_type, target_id, reason, comment)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, target_type, target_id, reason, comment);

  // Log
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'report_created', target_type, target_id, reason);

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(report);
});

module.exports = router;
