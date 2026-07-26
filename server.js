'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { initDatabase, closeDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Upload config
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/zip', 'application/x-rar-compressed',
  'application/x-7z-compressed'
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uid = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uid}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Недопустимый тип файла: ${file.mimetype}`));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Initialize database only when running directly (not when required by tests)
if (require.main === module) {
  initDatabase();
}

// Routes — order matters: specific paths before parameterized ones
const offersRouter = require('./routes/offers');
const chatRouter = require('./routes/chat');

// Standalone routes
app.use('/api/offers', offersRouter);  // GET /api/offers/my
app.use('/api/chat', chatRouter);      // GET /api/chat/list, GET/POST /api/chat/:taskId

// Parameterized task routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/tasks', offersRouter);   // POST /:taskId/offers, GET /:taskId/offers
app.use('/api/users', require('./routes/users'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));

// ── File upload API ──
const { authenticate } = require('./middleware/auth');

app.post('/api/upload', authenticate, upload.array('files', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Файлы не загружены' });
  }
  const files = req.files.map(f => ({
    name: f.originalname,
    path: `/uploads/${f.filename}`,
    size: f.size,
    type: f.mimetype
  }));
  res.json({ files });
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Файл слишком большой (макс. ${process.env.MAX_FILE_SIZE_MB || 10} МБ)` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Недопустимый тип')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ── Password change API ──
const bcrypt = require('bcryptjs');
const { getDb } = require('./db/init');

app.put('/api/users/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль минимум 6 символов' });
  }
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Текущий пароль неверный' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

  // Log action
  db.prepare('INSERT INTO admin_actions (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'password_change', 'user', req.user.id, 'Password changed');

  res.json({ message: 'Пароль изменён' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), name: process.env.APP_NAME || 'TaskBridge' });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TaskBridge server running at http://localhost:${PORT}`);
    console.log(`Demo mode: ${process.env.DEMO_MODE === 'true' ? 'ON' : 'OFF'}`);
  });
}

module.exports = app;
