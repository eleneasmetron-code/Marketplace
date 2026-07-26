'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/reviews — create review
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { task_id, rating, comment = '', likes = '', improvements = '' } = req.body;

  if (!task_id || !rating) {
    return res.status(400).json({ error: 'Укажите задачу и оценку' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Оценка от 1 до 5' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  if (task.status !== 'completed') return res.status(400).json({ error: 'Отзыв можно оставить только после завершения' });

  // Determine reviewer and reviewee
  let reviewee_id;
  if (task.creator_id === req.user.id) {
    reviewee_id = task.assigned_to; // Client reviews performer
  } else if (task.assigned_to === req.user.id) {
    reviewee_id = task.creator_id; // Performer reviews client
  } else {
    return res.status(403).json({ error: 'Вы не участвовали в этой задаче' });
  }

  if (!reviewee_id) return res.status(400).json({ error: 'Нет второго участника' });

  // Check if already reviewed
  const existing = db.prepare('SELECT id FROM reviews WHERE reviewer_id = ? AND task_id = ?')
    .get(req.user.id, task_id);
  if (existing) return res.status(409).json({ error: 'Вы уже оставили отзыв' });

  const result = db.prepare(`
    INSERT INTO reviews (reviewer_id, reviewee_id, task_id, rating, comment, likes, improvements)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, reviewee_id, task_id, rating, comment, likes, improvements);

  // Update reviewee's rating (weighted average)
  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as cnt
    FROM reviews WHERE reviewee_id = ?
  `).get(reviewee_id);

  db.prepare('UPDATE users SET rating = ?, review_count = ? WHERE id = ?')
    .run(Math.round(stats.avg_rating * 10) / 10, stats.cnt, reviewee_id);

  // Notify reviewee
  db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)')
    .run(reviewee_id, 'new_review', JSON.stringify({
      task_id: task_id, task_title: task.title,
      rating, message: `${req.user.name} оставил отзыв: ${rating}/5`
    }));

  // Log
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'review_created', 'review', result.lastInsertRowid, `Rating: ${rating}`);

  const review = db.prepare(`
    SELECT r.*, u.name as reviewer_name, u.avatar as reviewer_avatar
    FROM reviews r JOIN users u ON r.reviewer_id = u.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(review);
});

// GET /api/reviews/user/:userId — reviews for a user
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name, u.avatar as reviewer_avatar,
           t.title as task_title
    FROM reviews r
    JOIN users u ON r.reviewer_id = u.id
    JOIN tasks t ON r.task_id = t.id
    WHERE r.reviewee_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.userId);

  res.json({ reviews });
});

module.exports = router;
