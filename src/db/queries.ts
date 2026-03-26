import { eq, desc, sql } from 'drizzle-orm';
import { getDatabase } from './index.js';
import { courses, classes, tasks, changes, scrapeLog } from './schema.js';

// === Courses ===
export function upsertCourse(course: typeof courses.$inferInsert) {
  const db = getDatabase();
  return db
    .insert(courses)
    .values(course)
    .onConflictDoUpdate({
      target: courses.id,
      set: {
        name: course.name,
        code: course.code,
        section: course.section,
        professor: course.professor,
        zoomLink: course.zoomLink,
        internalUrl: course.internalUrl,
        lastSeen: course.lastSeen,
      },
    })
    .run();
}

export function getAllCourses() {
  const db = getDatabase();
  return db.select().from(courses).all();
}

// === Classes ===
export function upsertClass(classData: typeof classes.$inferInsert) {
  const db = getDatabase();
  return db
    .insert(classes)
    .values(classData)
    .onConflictDoUpdate({
      target: classes.id,
      set: {
        name: classData.name,
        professor: classData.professor,
        day: classData.day,
        startTime: classData.startTime,
        endTime: classData.endTime,
        room: classData.room,
        zoomLink: classData.zoomLink,
        section: classData.section,
        lastSeen: classData.lastSeen,
      },
    })
    .run();
}

export function getAllClasses() {
  const db = getDatabase();
  return db.select().from(classes).all();
}

export function getClassesByDay(day: string) {
  const db = getDatabase();
  return db.select().from(classes).where(eq(classes.day, day)).all();
}

// === Tasks ===
export function upsertTask(task: typeof tasks.$inferInsert) {
  const db = getDatabase();
  return db
    .insert(tasks)
    .values(task)
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        name: task.name,
        subject: task.subject,
        dueDate: task.dueDate,
        description: task.description,
        zoomLink: task.zoomLink,
        status: task.status,
        lastSeen: task.lastSeen,
      },
    })
    .run();
}

export function getAllTasks() {
  const db = getDatabase();
  return db.select().from(tasks).all();
}

export function getPendingTasks() {
  const db = getDatabase();
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'pending'))
    .all();
}

export function markTaskDone(taskId: string) {
  const db = getDatabase();
  return db
    .update(tasks)
    .set({ status: 'done' })
    .where(eq(tasks.id, taskId))
    .run();
}

// === Changes ===
export function insertChange(change: typeof changes.$inferInsert) {
  const db = getDatabase();
  return db.insert(changes).values(change).run();
}

export function getRecentChanges(limit = 20) {
  const db = getDatabase();
  return db
    .select()
    .from(changes)
    .orderBy(desc(changes.detectedAt))
    .limit(limit)
    .all();
}

// === Scrape Log ===
export function insertScrapeLog(log: typeof scrapeLog.$inferInsert) {
  const db = getDatabase();
  return db.insert(scrapeLog).values(log).run();
}

export function getLastScrapeLog() {
  const db = getDatabase();
  return db
    .select()
    .from(scrapeLog)
    .orderBy(desc(scrapeLog.createdAt))
    .limit(1)
    .get();
}

export function getScrapeStats() {
  const db = getDatabase();
  const totalClasses = db.select({ count: sql<number>`count(*)` }).from(classes).get();
  const totalTasks = db.select({ count: sql<number>`count(*)` }).from(tasks).get();
  const totalCourses = db.select({ count: sql<number>`count(*)` }).from(courses).get();
  const pendingTasks = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.status, 'pending'))
    .get();

  return {
    totalClasses: totalClasses?.count ?? 0,
    totalTasks: totalTasks?.count ?? 0,
    totalCourses: totalCourses?.count ?? 0,
    pendingTasks: pendingTasks?.count ?? 0,
  };
}
