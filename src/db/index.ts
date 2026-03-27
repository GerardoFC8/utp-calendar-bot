import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;

export function initDatabase(): typeof db {
  const dbPath = config.DATABASE_PATH;
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info({ dir: dbDir }, 'Created database directory');
  }

  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  // Create tables (idempotent — IF NOT EXISTS)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      section_id TEXT,
      name TEXT NOT NULL,
      class_number TEXT,
      modality TEXT,
      acad_career TEXT,
      period TEXT,
      teacher_first_name TEXT,
      teacher_last_name TEXT,
      teacher_email TEXT,
      progress REAL,
      last_seen INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      course_id TEXT,
      section_id TEXT,
      modality TEXT,
      start_at TEXT NOT NULL,
      finish_at TEXT NOT NULL,
      zoom_link TEXT,
      week_number INTEGER,
      is_long_lasting INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      course_name TEXT NOT NULL,
      course_id TEXT,
      publish_at TEXT,
      finish_at TEXT NOT NULL,
      week_number INTEGER,
      student_status TEXT,
      evaluation_system TEXT,
      is_qualificated INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      detected_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      classes_found INTEGER,
      activities_found INTEGER,
      courses_found INTEGER,
      changes_detected INTEGER,
      error_message TEXT,
      duration INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      date_str TEXT NOT NULL,
      sent_at INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sent_reminders_class_date_idx
      ON sent_reminders (class_id, date_str);

    CREATE TABLE IF NOT EXISTS sent_activity_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      sent_at INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sent_activity_reminders_idx
      ON sent_activity_reminders (activity_id, reminder_type);

    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER
    );
  `);

  logger.info({ path: dbPath }, 'Database initialized');
  return db;
}

export function getDatabase(): typeof db {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    logger.info('Database connection closed');
  }
}

export { db };
