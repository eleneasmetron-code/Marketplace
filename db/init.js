'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || './data.db';

let db;

function getDb() {
  if (!db) {
    const resolved = path.resolve(DB_PATH);
    db = new Database(resolved);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','performer','admin')),
      avatar TEXT DEFAULT '',
      company TEXT DEFAULT '',
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      website TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      task_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      blocked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS performer_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      specialization TEXT DEFAULT '',
      skills TEXT DEFAULT '[]',
      experience TEXT DEFAULT '',
      portfolio_links TEXT DEFAULT '[]',
      hourly_rate REAL DEFAULT 0,
      languages TEXT DEFAULT '[]',
      availability TEXT DEFAULT 'free' CHECK(availability IN ('free','busy','partial')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      expected_result TEXT DEFAULT '',
      category TEXT NOT NULL,
      budget REAL DEFAULT 0,
      budget_type TEXT DEFAULT 'fixed' CHECK(budget_type IN ('fixed','negotiable','hourly')),
      deadline TEXT DEFAULT '',
      urgency TEXT DEFAULT 'normal' CHECK(urgency IN ('low','normal','high','urgent')),
      remote_allowed INTEGER DEFAULT 1,
      required_skills TEXT DEFAULT '[]',
      files TEXT DEFAULT '[]',
      links TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft' CHECK(status IN (
        'draft','published','moderation','hidden',
        'assigned','in_progress','review','completed','cancelled','disputed','archived'
      )),
      creator_id INTEGER REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      performer_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      price REAL DEFAULT 0,
      estimated_time TEXT DEFAULT '',
      includes TEXT DEFAULT '',
      questions TEXT DEFAULT '',
      portfolio_link TEXT DEFAULT '',
      status TEXT DEFAULT 'sent' CHECK(status IN ('sent','viewed','shortlisted','accepted','rejected','cancelled')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_id INTEGER NOT NULL REFERENCES users(id),
      reviewee_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT DEFAULT '',
      likes TEXT DEFAULT '',
      improvements TEXT DEFAULT '',
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER REFERENCES users(id),
      target_type TEXT NOT NULL CHECK(target_type IN ('task','user','message','offer')),
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      comment TEXT DEFAULT '',
      status TEXT DEFAULT 'new' CHECK(status IN ('new','reviewing','closed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      seen INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id INTEGER DEFAULT 0,
      details TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );
  `);

  const userColumns = d.pragma('table_info(users)').map(c => c.name);
  if (!userColumns.includes('company')) {
    d.exec("ALTER TABLE users ADD COLUMN company TEXT DEFAULT ''");
  }

  // Create indexes for performance
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
    CREATE INDEX IF NOT EXISTS idx_offers_task ON offers(task_id);
    CREATE INDEX IF NOT EXISTS idx_offers_performer ON offers(performer_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, seen);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
  `);

  return d;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, initDatabase, closeDatabase };
