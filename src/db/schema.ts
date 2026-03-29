import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),           // courseId from API
  sectionId: text('section_id'),
  name: text('name').notNull(),          // classroom field from API
  classNumber: text('class_number'),
  modality: text('modality'),            // VT = virtual 24/7, R = presencial/en vivo
  acadCareer: text('acad_career'),       // PREG = real academic, PRED = institutional
  period: text('period'),                // e.g. "2262" = academic period
  teacherFirstName: text('teacher_first_name'),
  teacherLastName: text('teacher_last_name'),
  teacherEmail: text('teacher_email'),
  progress: real('progress'),
  currentWeek: integer('current_week'),
  totalWeeks: integer('total_weeks'),
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
});

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),           // API event id (uuid)
  title: text('title').notNull(),
  courseId: text('course_id'),           // FK reference to courses
  sectionId: text('section_id'),
  modality: text('modality'),            // R or VT
  startAt: text('start_at').notNull(),   // ISO datetime "2026-03-28 18:30:00"
  finishAt: text('finish_at').notNull(), // ISO datetime
  zoomLink: text('zoom_link'),
  weekNumber: integer('week_number'),
  isLongLasting: integer('is_long_lasting').notNull().default(0), // 0/1 boolean
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
});

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),           // activityId from API
  title: text('title').notNull(),
  activityType: text('activity_type').notNull(), // FORUM, HOMEWORK, EVALUATION
  courseName: text('course_name').notNull(),
  courseId: text('course_id'),
  publishAt: text('publish_at'),         // ISO datetime
  finishAt: text('finish_at').notNull(), // ISO datetime — DEADLINE
  weekNumber: integer('week_number'),
  studentStatus: text('student_status'), // PENDING, IN_PROCESS, PROGRAMMED
  evaluationSystem: text('evaluation_system'), // null or grading system name
  isQualificated: integer('is_qualificated').notNull().default(0), // 0/1 boolean
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
});

export const changes = sqliteTable('changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  changeType: text('change_type').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  detectedAt: integer('detected_at').$defaultFn(() => Date.now()),
});

export const scrapeLog = sqliteTable('scrape_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status').notNull(),
  classesFound: integer('classes_found'),
  activitiesFound: integer('activities_found'),
  coursesFound: integer('courses_found'),
  changesDetected: integer('changes_detected'),
  errorMessage: text('error_message'),
  duration: integer('duration'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
});

export const sentReminders = sqliteTable(
  'sent_reminders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    classId: text('class_id').notNull(),
    dateStr: text('date_str').notNull(),
    sentAt: integer('sent_at').$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('sent_reminders_class_date_idx').on(table.classId, table.dateStr)],
);

export const sentActivityReminders = sqliteTable(
  'sent_activity_reminders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    activityId: text('activity_id').notNull(),
    reminderType: text('reminder_type').notNull(), // '24h' or '2h'
    sentAt: integer('sent_at').$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('sent_activity_reminders_idx').on(table.activityId, table.reminderType)],
);

export const botSettings = sqliteTable('bot_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').$defaultFn(() => Date.now()),
});

export const unreadComments = sqliteTable('unread_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: text('content_id').notNull(),
  courseId: text('course_id'),
  courseName: text('course_name'),
  contentTitle: text('content_title').notNull(),
  weekNumber: integer('week_number'),
  unreadCount: integer('unread_count').notNull().default(0),
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
}, (table) => [uniqueIndex('unread_comments_content_idx').on(table.contentId)]);
