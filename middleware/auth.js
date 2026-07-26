'use strict';

const jwt = require('jsonwebtoken');
const { getDb } = require('../db/init');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware: requires valid JWT token. Sets req.user = {id, role, name, email}.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Verify user exists and is not blocked
    const db = getDb();
    const user = db.prepare('SELECT id, role, name, email, blocked FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

/**
 * Middleware: optional auth. Sets req.user if token present, null otherwise.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, role, name, email, blocked FROM users WHERE id = ?').get(payload.id);
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
}

/**
 * Middleware: requires admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

/**
 * Middleware: requires specific role(s).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

/**
 * Generate JWT token for a user.
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authenticate, optionalAuth, requireAdmin, requireRole, signToken, JWT_SECRET };
