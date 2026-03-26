import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { withBrowser } from '../scraper/browser.js';
import { login, isLoggedIn } from '../scraper/login.js';
import { scrapeCalendar, parsePendingActivities } from '../scraper/calendar.js';
import { scrapeCourses } from '../scraper/courses.js';
import { createInterceptor, logDiscoveredEndpoints } from '../scraper/interceptor.js';
import { deduplicateActivities } from '../scraper/tasks.js';
import { computeDiff, persistChanges } from './diff.js';
import { checkUpcomingClasses } from './reminders.js';
import { sendMorningReminder, sendChangeNotifications } from '../bot/notifications.js';
import {
  getAllClasses,
  getAllActivities,
  getAllCourses,
  upsertClass,
  upsertCourse,
  upsertActivity,
  insertScrapeLog,
} from '../db/queries.js';
import type { ClassData, ActivityData, CourseData } from '../scraper/parser.js';

export async function executeScrape(): Promise<{
  coursesFound: number;
  classesFound: number;
  activitiesFound: number;
  changesDetected: number;
  duration: number;
}> {
  const startTime = Date.now();
  logger.info('Starting scrape cycle');

  try {
    const result = await withBrowser(async (page, context) => {
      // Setup interceptor BEFORE any navigation
      const intercepted = createInterceptor(page);

      // Login or verify session
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) {
        await login(page, context);
      }

      // Navigate to courses page — triggers dashboard-courses API call
      const courses = await scrapeCourses(page, intercepted);

      // Navigate to calendar page — triggers calendar + calendarActivities API calls
      const { classes, activities: calendarActivities } = await scrapeCalendar(page, intercepted);

      // Parse pending activities from intercepted data (available from dashboard navigation)
      const pendingActivities = parsePendingActivities(intercepted.pendingActivities);

      // Merge and deduplicate activities (calendar + pending endpoints)
      const allActivities = deduplicateActivities([...calendarActivities, ...pendingActivities]);

      // Log discovered API endpoints
      logDiscoveredEndpoints(intercepted);

      return { courses, classes, activities: allActivities };
    });

    // Compute diffs
    const existingClasses = getAllClasses() as unknown as ClassData[];
    const existingCourses = getAllCourses() as unknown as CourseData[];
    const existingActivities = getAllActivities() as unknown as ActivityData[];

    const classDiff = computeDiff(
      existingClasses as unknown as Parameters<typeof computeDiff>[0],
      result.classes as unknown as Parameters<typeof computeDiff>[1],
    );
    const courseDiff = computeDiff(
      existingCourses as unknown as Parameters<typeof computeDiff>[0],
      result.courses as unknown as Parameters<typeof computeDiff>[1],
    );
    const activityDiff = computeDiff(
      existingActivities as unknown as Parameters<typeof computeDiff>[0],
      result.activities as unknown as Parameters<typeof computeDiff>[1],
    );

    // Persist changes to changes table
    persistChanges(classDiff, 'class');
    persistChanges(courseDiff, 'course');
    persistChanges(activityDiff, 'activity');

    // Upsert data
    const now = Date.now();
    for (const cls of result.classes) {
      upsertClass({
        id: cls.id,
        title: cls.title,
        courseId: cls.courseId,
        sectionId: cls.sectionId,
        modality: cls.modality,
        startAt: cls.startAt,
        finishAt: cls.finishAt,
        zoomLink: cls.zoomLink ?? null,
        weekNumber: cls.weekNumber ?? null,
        isLongLasting: cls.isLongLasting ? 1 : 0,
        lastSeen: now,
      });
    }
    for (const course of result.courses) {
      upsertCourse({
        id: course.id,
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
        lastSeen: now,
      });
    }
    for (const activity of result.activities) {
      upsertActivity({
        id: activity.id,
        title: activity.title,
        activityType: activity.activityType,
        courseName: activity.courseName,
        courseId: activity.courseId,
        publishAt: activity.publishAt,
        finishAt: activity.finishAt,
        weekNumber: activity.weekNumber,
        studentStatus: activity.studentStatus,
        evaluationSystem: activity.evaluationSystem ?? null,
        isQualificated: activity.isQualificated ? 1 : 0,
        lastSeen: now,
      });
    }

    const totalChanges =
      classDiff.added.length + classDiff.removed.length + classDiff.modified.length +
      courseDiff.added.length + courseDiff.removed.length + courseDiff.modified.length +
      activityDiff.added.length + activityDiff.removed.length + activityDiff.modified.length;

    const duration = Date.now() - startTime;

    // Log scrape result
    insertScrapeLog({
      status: 'success',
      classesFound: result.classes.length,
      activitiesFound: result.activities.length,
      coursesFound: result.courses.length,
      changesDetected: totalChanges,
      duration,
    });

    logger.info({
      classes: result.classes.length,
      courses: result.courses.length,
      activities: result.activities.length,
      changes: totalChanges,
      duration,
    }, 'Scrape completed successfully');

    return {
      coursesFound: result.courses.length,
      classesFound: result.classes.length,
      activitiesFound: result.activities.length,
      changesDetected: totalChanges,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    insertScrapeLog({
      status: 'error',
      errorMessage,
      duration,
    });

    logger.error({ error, duration }, 'Scrape failed');
    throw error;
  }
}

export function startScheduler(bot: Telegraf): void {
  // Periodic scraping
  cron.schedule(config.SCRAPE_CRON, async () => {
    logger.info('Cron: Starting scheduled scrape');
    try {
      const result = await executeScrape();

      if (result.changesDetected > 0) {
        const { getRecentChanges } = await import('../db/queries.js');
        const recentChanges = getRecentChanges(result.changesDetected);
        await sendChangeNotifications(bot, recentChanges);
      }
    } catch (error) {
      logger.error({ error }, 'Scheduled scrape failed');
    }
  }, {
    timezone: config.TZ,
  });

  logger.info({ cron: config.SCRAPE_CRON }, 'Scrape cron job scheduled');

  // Morning reminder
  cron.schedule(config.MORNING_REMINDER_CRON, async () => {
    logger.info('Cron: Sending morning reminder');
    try {
      await sendMorningReminder(bot);
    } catch (error) {
      logger.error({ error }, 'Morning reminder failed');
    }
  }, {
    timezone: config.TZ,
  });

  logger.info({ cron: config.MORNING_REMINDER_CRON }, 'Morning reminder cron job scheduled');

  // Pre-class reminders (check every minute)
  cron.schedule('* * * * *', async () => {
    try {
      await checkUpcomingClasses(bot);
    } catch (error) {
      logger.error({ error }, 'Class reminder check failed');
    }
  }, {
    timezone: config.TZ,
  });

  logger.info({ minutes: config.CLASS_REMINDER_MINUTES }, 'Class reminder checker started');
}
