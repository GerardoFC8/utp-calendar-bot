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

  // Create tables directly using SQL (no migration files needed for initial setup)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      section TEXT,
      professor TEXT,
      zoom_link TEXT,
      internal_url TEXT,
      last_seen INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      professor TEXT,
      day TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT,
      zoom_link TEXT,
      section TEXT,
      last_seen INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT,
      due_date TEXT NOT NULL,
      description TEXT,
      zoom_link TEXT,
      status TEXT DEFAULT 'pending',
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
      tasks_found INTEGER,
      changes_detected INTEGER,
      error_message TEXT,
      duration INTEGER,
      created_at INTEGER
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
