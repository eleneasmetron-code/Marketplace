'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/performers/list — list performers with filters
router.get('/performers/list', (req, res) => {
  const db = getDb();
  const { skill, min_rating, availability, page = 1, limit = 20 } = req.query;

  let where = 'WHERE u.role = ? AND u.blocked = 0';
  const params = ['performer'];

  if (min_rating) {
    where += ' AND u.rating >= ?';
    params.push(Number(min_rating));
  }
  if (availability) {
    where += ' AND pp.availability = ?';
    params.push(availability);
  }

  let sql = `
    SELECT u.id, u.name, u.avatar, u.city, u.country, u.rating, u.review_count, u.completed_count,
           pp.specialization, pp.skills, pp.hourly_rate, pp.availability
    FROM users u
    LEFT JOIN performer_profiles pp ON u.id = pp.user_id
    ${where}
    ORDER BY u.rating DESC, u.completed_count DESC
    LIMIT ? OFFSET ?
  `;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  let performers = db.prepare(sql).all(...params).map(p => ({
    ...p,
    skills: JSON.parse(p.skills || '[]')
  }));

  if (skill) {
    performers = performers.filter(p =>
      p.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
    );
  }

  res.json({ performers });
});

// GET /api/users/:id — public profile
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, email, role, avatar, company, city, country, bio, website, contact,
           rating, review_count, task_count, completed_count, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  if (user.role === 'client') {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status IN ('published','moderation') THEN 1 ELSE 0 END) as open_tasks,
        SUM(CASE WHEN status IN ('assigned','in_progress','review') THEN 1 ELSE 0 END) as active_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        COALESCE(SUM((SELECT COUNT(*) FROM offers o WHERE o.task_id = t.id)), 0) as total_offers
      FROM tasks t WHERE t.creator_id = ?
    `).get(user.id);
    user.client_profile = {
      company: user.company || '',
      published_tasks: stats.total_tasks || 0,
      open_tasks: stats.open_tasks || 0,
      active_tasks: stats.active_tasks || 0,
      completed_tasks: stats.completed_tasks || 0,
      total_offers: stats.total_offers || 0
    };
    user.recent_tasks = db.prepare(`
      SELECT id, title, category, budget, budget_type, status, created_at,
        (SELECT COUNT(*) FROM offers WHERE task_id = tasks.id) as offer_count
      FROM tasks
      WHERE creator_id = ? AND status != 'hidden'
      ORDER BY created_at DESC
      LIMIT 5
    `).all(user.id);
  }

  if (user.role === 'performer') {
    const profile = db.prepare('SELECT * FROM performer_profiles WHERE user_id = ?').get(user.id);
    if (profile) {
      user.performer_profile = {
        specialization: profile.specialization,
        skills: JSON.parse(profile.skills || '[]'),
        experience: profile.experience,
        portfolio_links: JSON.parse(profile.portfolio_links || '[]'),
        hourly_rate: profile.hourly_rate,
        languages: JSON.parse(profile.languages || '[]'),
        availability: profile.availability
      };
    }
    user.performer_stats = db.prepare(`
      SELECT
        COUNT(*) as sent_offers,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_offers,
        SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END) as shortlisted_offers
      FROM offers WHERE performer_id = ?
    `).get(user.id);
    user.active_tasks = db.prepare(`
      SELECT id, title, category, budget, budget_type, status, updated_at
      FROM tasks
      WHERE assigned_to = ? AND status IN ('assigned','in_progress','review')
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(user.id);
  }

  // Get reviews for this user
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name
    FROM reviews r JOIN users u ON r.reviewer_id = u.id
    WHERE r.reviewee_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(user.id);

  user.reviews = reviews;

  // Hide email from other users
  if (!req.user || req.user.id !== user.id) {
    delete user.email;
    delete user.contact;
  }

  res.json(user);
});

// PUT /api/users/profile — update own profile
router.put('/profile', authenticate, (req, res) => {
  const db = getDb();
  const { name, avatar, company, city, country, bio, website, contact } = req.body;

  db.prepare(`
    UPDATE users SET name = COALESCE(?, name), avatar = COALESCE(?, avatar),
    company = COALESCE(?, company), city = COALESCE(?, city), country = COALESCE(?, country),
    bio = COALESCE(?, bio), website = COALESCE(?, website),
    contact = COALESCE(?, contact)
    WHERE id = ?
  `).run(name, avatar, company, city, country, bio, website, contact, req.user.id);

  // Update performer profile if applicable
  if (req.user.role === 'performer') {
    const { specialization, skills, experience, portfolio_links, hourly_rate, languages, availability } = req.body;
    const existing = db.prepare('SELECT user_id FROM performer_profiles WHERE user_id = ?').get(req.user.id);
    if (existing) {
      db.prepare(`
        UPDATE performer_profiles SET
        specialization = COALESCE(?, specialization),
        skills = COALESCE(?, skills),
        experience = COALESCE(?, experience),
        portfolio_links = COALESCE(?, portfolio_links),
        hourly_rate = COALESCE(?, hourly_rate),
        languages = COALESCE(?, languages),
        availability = COALESCE(?, availability)
        WHERE user_id = ?
      `).run(
        specialization,
        skills ? JSON.stringify(skills) : null,
        experience,
        portfolio_links ? JSON.stringify(portfolio_links) : null,
        hourly_rate,
        languages ? JSON.stringify(languages) : null,
        availability,
        req.user.id
      );
    }
  }

  const updated = db.prepare('SELECT id, name, email, role, avatar, company, city, country, bio, website, contact, rating, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

module.exports = router;
