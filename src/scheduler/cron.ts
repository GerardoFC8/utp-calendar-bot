import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { withBrowser } from '../scraper/browser.js';
import { login, isLoggedIn } from '../scraper/login.js';
import { scrapeCalendar } from '../scraper/calendar.js';
import { scrapeCourses } from '../scraper/courses.js';
import { scrapeAllCourseDetails } from '../scraper/course-detail.js';
import { createInterceptor, logDiscoveredEndpoints } from '../scraper/interceptor.js';
import { deduplicateTasks } from '../scraper/tasks.js';
import { computeDiff, persistChanges } from './diff.js';
import { checkUpcomingClasses } from './reminders.js';
import { sendMorningReminder, sendChangeNotifications } from '../bot/notifications.js';
import {
  getAllClasses,
  getAllCourses,
  getPendingTasks,
  upsertClass,
  upsertCourse,
  upsertTask,
  insertScrapeLog,
} from '../db/queries.js';
import type { ClassData, TaskData, CourseData } from '../scraper/parser.js';

export async function executeScrape(): Promise<{
  coursesFound: number;
  classesFound: number;
  tasksFound: number;
  changesDetected: number;
  duration: number;
}> {
  const startTime = Date.now();
  logger.info('Starting scrape cycle');

  try {
    const result = await withBrowser(async (page, context) => {
      // Setup interceptor
      const intercepted = createInterceptor(page);

      // Login
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) {
        await login(page, context);
      }

      // Scrape calendar
      const calendarClasses = await scrapeCalendar(page);

      // Scrape courses
      const courses = await scrapeCourses(page);

      // Scrape course details (with rate limiting)
      const { allTasks, courseZoomLinks } = await scrapeAllCourseDetails(page, courses);

      // Log discovered API endpoints
      logDiscoveredEndpoints(intercepted);

      // Deduplicate tasks
      const tasks = deduplicateTasks(allTasks);

      // Update course zoom links
      for (const course of courses) {
        const zoomLinks = courseZoomLinks.get(course.id);
        if (zoomLinks && zoomLinks.length > 0) {
          course.zoomLink = zoomLinks[0];
        }
      }

      return { calendarClasses, courses, tasks };
    });

    // Compute diffs
    const existingClasses = getAllClasses() as ClassData[];
    const existingCourses = getAllCourses() as CourseData[];
    const existingTasks = getPendingTasks() as TaskData[];

    const classDiff = computeDiff(
      existingClasses as unknown as Parameters<typeof computeDiff>[0],
      result.calendarClasses as unknown as Parameters<typeof computeDiff>[1]
    );
    const courseDiff = computeDiff(
      existingCourses as unknown as Parameters<typeof computeDiff>[0],
      result.courses as unknown as Parameters<typeof computeDiff>[1]
    );
    const taskDiff = computeDiff(
      existingTasks as unknown as Parameters<typeof computeDiff>[0],
      result.tasks as unknown as Parameters<typeof computeDiff>[1]
    );

    // Persist changes
    persistChanges(classDiff, 'class');
    persistChanges(courseDiff, 'course');
    persistChanges(taskDiff, 'task');

    // Upsert data
    const now = new Date();
    for (const cls of result.calendarClasses) {
      upsertClass({ ...cls, lastSeen: now });
    }
    for (const course of result.courses) {
      upsertCourse({ ...course, lastSeen: now });
    }
    for (const task of result.tasks) {
      upsertTask({ ...task, lastSeen: now });
    }

    const totalChanges =
      classDiff.added.length + classDiff.removed.length + classDiff.modified.length +
      courseDiff.added.length + courseDiff.removed.length + courseDiff.modified.length +
      taskDiff.added.length + taskDiff.removed.length + taskDiff.modified.length;

    const duration = Date.now() - startTime;

    // Log scrape result
    insertScrapeLog({
      status: 'success',
      classesFound: result.calendarClasses.length,
      tasksFound: result.tasks.length,
      changesDetected: totalChanges,
      duration,
    });

    logger.info({
      classes: result.calendarClasses.length,
      courses: result.courses.length,
      tasks: result.tasks.length,
      changes: totalChanges,
      duration,
    }, 'Scrape completed successfully');

    return {
      coursesFound: result.courses.length,
      classesFound: result.calendarClasses.length,
      tasksFound: result.tasks.length,
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
        // Get recent changes for notification
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
