import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  section: text('section'),
  professor: text('professor'),
  zoomLink: text('zoom_link'),
  internalUrl: text('internal_url'),
  lastSeen: integer('last_seen', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  professor: text('professor'),
  day: text('day').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  room: text('room'),
  zoomLink: text('zoom_link'),
  section: text('section'),
  lastSeen: integer('last_seen', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject'),
  dueDate: text('due_date').notNull(),
  description: text('description'),
  zoomLink: text('zoom_link'),
  status: text('status').default('pending'),
  lastSeen: integer('last_seen', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const changes = sqliteTable('changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  changeType: text('change_type').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  detectedAt: integer('detected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const scrapeLog = sqliteTable('scrape_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status').notNull(),
  classesFound: integer('classes_found'),
  tasksFound: integer('tasks_found'),
  changesDetected: integer('changes_detected'),
  errorMessage: text('error_message'),
  duration: integer('duration'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
