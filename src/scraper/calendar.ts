import type { Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { type ClassData, type ActivityData, cleanText } from './parser.js';
import { takeScreenshot } from './browser.js';
import type { InterceptedData } from './interceptor.js';

export async function scrapeCalendar(
  page: Page,
  intercepted: InterceptedData,
): Promise<{ classes: ClassData[]; activities: ActivityData[] }> {
  const calendarUrl = `${config.UTP_BASE_URL}${config.UTP_CALENDAR_PATH}`;
  logger.info({ url: calendarUrl }, 'Navigating to calendar');

  await page.goto(calendarUrl, { waitUntil: 'networkidle' });

  // Give the SPA time to trigger all API calls
  await page.waitForTimeout(3_000);

  const classes = parseCalendarClasses(intercepted.calendarEvents);
  const activities = parseCalendarActivities(intercepted.calendarActivities);

  logger.info(
    { classes: classes.length, activities: activities.length },
    'Calendar scrape complete',
  );

  if (classes.length === 0 && activities.length === 0) {
    await takeScreenshot(page, 'calendar-empty');
    logger.warn('No calendar data captured — check interceptor');
  }

  return { classes, activities };
}

// ============================================================
// Parse class sessions from /course/student/calendar
// ============================================================

function parseCalendarClasses(apiData: unknown[]): ClassData[] {
  const classes: ClassData[] = [];

  for (const response of apiData) {
    const events = extractEvents(response);

    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      const obj = event as Record<string, unknown>;

      // Only real scheduled classes: type=CLASS and isLongLasting=false
      if (obj['type'] !== 'CLASS') continue;
      if (obj['isLongLasting'] === true) continue;

      try {
        const classData = parseClassEvent(obj);
        if (classData) classes.push(classData);
      } catch (err) {
        logger.debug({ err, event: obj['title'] }, 'Failed to parse class event');
      }
    }
  }

  logger.info({ count: classes.length }, 'Classes parsed from calendar API');
  return classes;
}

function parseClassEvent(obj: Record<string, unknown>): ClassData | null {
  const id = obj['id'] as string;
  const title = obj['title'] as string;
  const startAt = obj['startAt'] as string;
  const finishAt = obj['finishAt'] as string;
  const modality = (obj['modality'] as string) ?? 'R';

  if (!id || !title || !startAt || !finishAt) return null;

  const metadata = (obj['metadata'] ?? {}) as Record<string, unknown>;
  const courseId = (metadata['courseId'] as string) ?? '';
  const sectionId = (metadata['sectionId'] as string) ?? '';
  const zoomLink = (metadata['zoomLink'] as string | null) ?? undefined;

  return {
    id,
    title: cleanText(title),
    courseId,
    sectionId,
    modality,
    startAt,
    finishAt,
    zoomLink: zoomLink || undefined,
    weekNumber: undefined,
    isLongLasting: false,
  };
}

// ============================================================
// Parse activities from /course/student/calendar/activities
// ============================================================

function parseCalendarActivities(apiData: unknown[]): ActivityData[] {
  const activities: ActivityData[] = [];

  for (const response of apiData) {
    const events = extractEvents(response);

    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      const obj = event as Record<string, unknown>;

      // Only activity events
      if (obj['type'] !== 'ACTIVITY') continue;

      try {
        const activity = parseActivityEvent(obj);
        if (activity) activities.push(activity);
      } catch (err) {
        logger.debug({ err, event: obj['title'] }, 'Failed to parse activity event');
      }
    }
  }

  logger.info({ count: activities.length }, 'Activities parsed from calendar activities API');
  return activities;
}

function parseActivityEvent(obj: Record<string, unknown>): ActivityData | null {
  const title = obj['title'] as string;
  if (!title) return null;

  const metadata = (obj['metadata'] ?? {}) as Record<string, unknown>;

  const activityId = (metadata['activityId'] as string) ?? (obj['id'] as string);
  if (!activityId) return null;

  const courseName = (metadata['courseName'] as string) ?? '';
  const courseId = (metadata['courseId'] as string) ?? '';
  const activityType = (metadata['activityType'] as string) ?? 'HOMEWORK';
  const weekNumber = (metadata['weekNumber'] as number) ?? 0;
  const studentStatus = (metadata['studentStatus'] as string) ?? 'PENDING';
  const evaluationSystem = (metadata['evaluationSystem'] as string | null) ?? undefined;

  // Real deadline is activityFinishAt from metadata
  const finishAt =
    (metadata['activityFinishAt'] as string) ??
    (obj['finishAt'] as string) ??
    '';

  const publishAt =
    (metadata['activityPublishAt'] as string) ??
    (obj['startAt'] as string) ??
    '';

  if (!finishAt) return null;

  return {
    id: activityId,
    title: cleanText(title),
    activityType,
    courseName: cleanText(courseName),
    courseId,
    publishAt,
    finishAt,
    weekNumber,
    studentStatus,
    evaluationSystem: evaluationSystem || undefined,
    isQualificated: false, // from calendar we don't have this info
  };
}

// ============================================================
// Parse pending activities from /course/student/activities/pending/resume
// ============================================================

export function parsePendingActivities(apiData: unknown[]): ActivityData[] {
  const activities: ActivityData[] = [];

  for (const response of apiData) {
    const items = extractArray(response);

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      try {
        const activity = parsePendingActivityItem(obj);
        if (activity) activities.push(activity);
      } catch (err) {
        logger.debug({ err }, 'Failed to parse pending activity');
      }
    }
  }

  logger.info({ count: activities.length }, 'Pending activities parsed from API');
  return activities;
}

function parsePendingActivityItem(obj: Record<string, unknown>): ActivityData | null {
  const activityId = obj['activityId'] as string;
  const title = obj['activityTitle'] as string;
  const finishAt = obj['finishAt'] as string;

  if (!activityId || !title || !finishAt) return null;

  const courseName = (obj['courseName'] as string) ?? '';
  const courseId = (obj['courseId'] as string) ?? '';
  const activityType = (obj['type'] as string) ?? 'HOMEWORK';
  const weekNumber = (obj['weekNumber'] as number) ?? 0;
  const activityStatus = (obj['activityStatusFinal'] as string) ?? 'PENDING';
  const isQualificated = Boolean(obj['isQualificated']);

  const publishAt = (obj['publishAt'] as string) ?? '';

  // Normalize finishAt — sometimes has ".0" suffix
  const finishAtClean = finishAt.replace(/\.0$/, '').trim();
  const publishAtClean = publishAt.replace(/\.0$/, '').trim();

  return {
    id: activityId,
    title: cleanText(title),
    activityType,
    courseName: cleanText(courseName),
    courseId,
    publishAt: publishAtClean,
    finishAt: finishAtClean,
    weekNumber,
    studentStatus: activityStatus,
    evaluationSystem: undefined,
    isQualificated,
  };
}

// ============================================================
// Helpers
// ============================================================

function extractEvents(response: unknown): unknown[] {
  if (!response || typeof response !== 'object') return [];
  const obj = response as Record<string, unknown>;

  // Structure: { data: { current_interval: { events: [...] } } }
  if (obj['data'] && typeof obj['data'] === 'object') {
    const data = obj['data'] as Record<string, unknown>;

    if (data['current_interval'] && typeof data['current_interval'] === 'object') {
      const interval = data['current_interval'] as Record<string, unknown>;
      if (Array.isArray(interval['events'])) {
        return interval['events'];
      }
    }

    // Try data directly as array
    if (Array.isArray(data)) return data;
  }

  // Try top-level events
  if (Array.isArray(obj['events'])) return obj['events'];

  // Try as direct array
  if (Array.isArray(response)) return response;

  return [];
}

function extractArray(response: unknown): unknown[] {
  if (!response || typeof response !== 'object') return [];
  const obj = response as Record<string, unknown>;

  // Structure: { data: [...] }
  if (Array.isArray(obj['data'])) return obj['data'];

  // Try as direct array
  if (Array.isArray(response)) return response;

  return [];
}
