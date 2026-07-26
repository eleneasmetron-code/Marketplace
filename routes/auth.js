'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/register
router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Заполните все поля: имя, email, пароль, роль' });
  }
  if (!['client', 'performer'].includes(role)) {
    return res.status(400).json({ error: 'Роль должна быть client или performer' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, password_hash, role);

  // If performer, create empty performer profile
  if (role === 'performer') {
    db.prepare('INSERT INTO performer_profiles (user_id) VALUES (?)').run(result.lastInsertRowid);
  }

  // Create welcome notification
  db.prepare(
    'INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)'
  ).run(result.lastInsertRowid, 'welcome', JSON.stringify({ message: 'Добро пожаловать в TaskBridge!' }));

  const user = db.prepare('SELECT id, name, email, role, avatar, city, country, bio, rating, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
  const token = signToken(user);

  res.status(201).json({ token, user });
});

// POST /api/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Укажите email и пароль' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  if (user.blocked) {
    return res.status(403).json({ error: 'Аккаунт заблокирован администрацией' });
  }

  const token = signToken(user);
  const safeUser = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    avatar: user.avatar, city: user.city, country: user.country,
    bio: user.bio, rating: user.rating, created_at: user.created_at
  };

  res.json({ token, user: safeUser });
});

module.exports = router;
