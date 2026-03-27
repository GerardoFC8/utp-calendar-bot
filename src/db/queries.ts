import { desc, sql, gte, lte, and, inArray, lt, like } from 'drizzle-orm';
import { getDatabase } from './index.js';
import { courses, classes, activities, changes, scrapeLog, sentReminders, sentActivityReminders, botSettings } from './schema.js';

// === Courses ===

export function upsertCourse(course: typeof courses.$inferInsert) {
  const db = getDatabase();
  return db
    .insert(courses)
    .values(course)
    .onConflictDoUpdate({
      target: courses.id,
      set: {
        sectionId: course.sectionId,
        name: course.name,
        classNumber: course.classNumber,
        modality: course.modality,
        acadCareer: course.acadCareer,
        period: course.period,
        teacherFirstName: course.teacherFirstName,
        teacherLastName: course.teacherLastName,
        teacherEmail: course.teacherEmail,
        progress: course.progress,
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
        title: classData.title,
        courseId: classData.courseId,
        sectionId: classData.sectionId,
        modality: classData.modality,
        startAt: classData.startAt,
        finishAt: classData.finishAt,
        zoomLink: classData.zoomLink,
        weekNumber: classData.weekNumber,
        isLongLasting: classData.isLongLasting,
        lastSeen: classData.lastSeen,
      },
    })
    .run();
}

export function getAllClasses() {
  const db = getDatabase();
  return db.select().from(classes).all();
}

export function getUpcomingClasses(fromDate: string) {
  const db = getDatabase();
  return db
    .select()
    .from(classes)
    .where(gte(classes.startAt, fromDate))
    .orderBy(classes.startAt)
    .all();
}

export function getClassesForDate(datePrefix: string) {
  // datePrefix = "2026-03-28" — matches all classes starting on that date
  const db = getDatabase();
  return db
    .select()
    .from(classes)
    .where(
      and(
        gte(classes.startAt, `${datePrefix} 00:00:00`),
        lte(classes.startAt, `${datePrefix} 23:59:59`),
      ),
    )
    .orderBy(classes.startAt)
    .all();
}

// === Activities ===

export function upsertActivity(activity: typeof activities.$inferInsert) {
  const db = getDatabase();
  return db
    .insert(activities)
    .values(activity)
    .onConflictDoUpdate({
      target: activities.id,
      set: {
        title: activity.title,
        activityType: activity.activityType,
        courseName: activity.courseName,
        courseId: activity.courseId,
        publishAt: activity.publishAt,
        finishAt: activity.finishAt,
        weekNumber: activity.weekNumber,
        studentStatus: activity.studentStatus,
        evaluationSystem: activity.evaluationSystem,
        isQualificated: activity.isQualificated,
        lastSeen: activity.lastSeen,
      },
    })
    .run();
}

export function getAllActivities() {
  const db = getDatabase();
  return db.select().from(activities).all();
}

export function getPendingActivities() {
  const db = getDatabase();
  return db
    .select()
    .from(activities)
    .where(
      inArray(activities.studentStatus, ['PENDING', 'IN_PROCESS', 'PROGRAMMED']),
    )
    .orderBy(activities.finishAt)
    .all();
}

export function getActivitiesForMonth(year: number, month: number) {
  const db = getDatabase();
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = `${year}-${pad(month)}-%`;
  return db
    .select()
    .from(activities)
    .where(
      and(
        like(activities.finishAt, prefix),
        inArray(activities.studentStatus, ['PENDING', 'IN_PROCESS', 'PROGRAMMED']),
      ),
    )
    .orderBy(activities.finishAt)
    .all();
}

export function getActivitiesDueSoon(days: number) {
  const db = getDatabase();
  const now = new Date();
  const limit = new Date(now.getTime() + days * 86_400_000);

  const nowStr = formatDatetime(now);
  const limitStr = formatDatetime(limit);

  return db
    .select()
    .from(activities)
    .where(
      and(
        gte(activities.finishAt, nowStr),
        lte(activities.finishAt, limitStr),
      ),
    )
    .orderBy(activities.finishAt)
    .all();
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
  const totalActivities = db.select({ count: sql<number>`count(*)` }).from(activities).get();
  const totalCourses = db.select({ count: sql<number>`count(*)` }).from(courses).get();
  const pendingActivities = db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(inArray(activities.studentStatus, ['PENDING', 'IN_PROCESS', 'PROGRAMMED']))
    .get();

  return {
    totalClasses: totalClasses?.count ?? 0,
    totalActivities: totalActivities?.count ?? 0,
    totalCourses: totalCourses?.count ?? 0,
    pendingActivities: pendingActivities?.count ?? 0,
  };
}

// === Sent Reminders ===

export function hasReminderBeenSent(classId: string, dateStr: string): boolean {
  const db = getDatabase();
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(sentReminders)
    .where(and(sql`${sentReminders.classId} = ${classId}`, sql`${sentReminders.dateStr} = ${dateStr}`))
    .get();
  return (result?.count ?? 0) > 0;
}

export function markReminderSent(classId: string, dateStr: string): void {
  const db = getDatabase();
  db.insert(sentReminders).values({ classId, dateStr }).onConflictDoNothing().run();
}

export function cleanOldReminders(beforeDateStr: string): void {
  const db = getDatabase();
  db.delete(sentReminders).where(lt(sentReminders.dateStr, beforeDateStr)).run();
}

// === Sent Activity Reminders ===

export function hasActivityReminderBeenSent(activityId: string, reminderType: string): boolean {
  const db = getDatabase();
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(sentActivityReminders)
    .where(and(
      sql`${sentActivityReminders.activityId} = ${activityId}`,
      sql`${sentActivityReminders.reminderType} = ${reminderType}`,
    ))
    .get();
  return (result?.count ?? 0) > 0;
}

export function markActivityReminderSent(activityId: string, reminderType: string): void {
  const db = getDatabase();
  db.insert(sentActivityReminders).values({ activityId, reminderType }).onConflictDoNothing().run();
}

export function cleanOldActivityReminders(): void {
  const db = getDatabase();
  const now = new Date();
  const nowStr = formatDatetime(now);
  db.run(sql`
    DELETE FROM sent_activity_reminders
    WHERE activity_id IN (
      SELECT id FROM activities WHERE finish_at < ${nowStr}
    )
  `);
}

// === Bot Settings ===

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const result = db.select().from(botSettings).where(sql`${botSettings.key} = ${key}`).get();
  return result?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.insert(botSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: botSettings.key, set: { value, updatedAt: Date.now() } })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const db = getDatabase();
  const rows = db.select().from(botSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// === Helpers ===

function formatDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Row type aliases for callers that need the raw DB shape
export type ClassRow = typeof classes.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
