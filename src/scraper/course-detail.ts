import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { SELECTORS } from './selectors.js';
import { type TaskData, type CourseData, cleanText, parseDate, generateTaskId } from './parser.js';
import { takeScreenshot } from './browser.js';

interface CourseDetails {
  zoomLinks: string[];
  tasks: TaskData[];
}

export async function scrapeCourseDetail(
  page: Page,
  course: CourseData
): Promise<CourseDetails> {
  const result: CourseDetails = {
    zoomLinks: [],
    tasks: [],
  };

  if (!course.internalUrl) {
    logger.warn({ course: course.name }, 'No internal URL for course, skipping detail');
    return result;
  }

  logger.info({ course: course.name, url: course.internalUrl }, 'Navigating to course detail');

  try {
    await page.goto(course.internalUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2_000); // Let SPA render

    // Extract Zoom links
    const zoomLinks = await page.$$eval(SELECTORS.courseZoomLink, (links) => {
      return links
        .map((link) => link.getAttribute('href') || '')
        .filter((href) => href.includes('zoom'));
    });

    result.zoomLinks = [...new Set(zoomLinks)]; // Deduplicate
    if (result.zoomLinks.length > 0) {
      logger.info({ course: course.name, count: result.zoomLinks.length }, 'Zoom links found');
    }

    // Extract tasks/assignments
    try {
      await page.waitForSelector(SELECTORS.courseTasksList, { timeout: 5_000 });

      const rawTasks = await page.$$eval(SELECTORS.courseTaskItem, (items) => {
        return items.map((item) => ({
          title: item.querySelector('[class*="title"], [class*="name"]')?.textContent || '',
          dueDate: item.querySelector('[class*="due-date"], [class*="deadline"], [class*="date"]')?.textContent || '',
          description: item.querySelector('[class*="description"], [class*="detail"]')?.textContent || '',
        }));
      });

      result.tasks = rawTasks
        .filter((t) => t.title && t.dueDate)
        .map((t) => ({
          id: generateTaskId(cleanText(t.title), parseDate(cleanText(t.dueDate))),
          name: cleanText(t.title),
          subject: course.name,
          dueDate: parseDate(cleanText(t.dueDate)),
          description: t.description ? cleanText(t.description) : undefined,
          status: 'pending' as const,
        }));

      logger.info({ course: course.name, count: result.tasks.length }, 'Tasks extracted');
    } catch {
      logger.debug({ course: course.name }, 'No tasks section found');
    }
  } catch (error) {
    logger.error({ course: course.name, error }, 'Failed to scrape course detail');
    await takeScreenshot(page, `course-detail-error-${course.id}`);
  }

  // Rate limiting
  await page.waitForTimeout(2_500);

  return result;
}

export async function scrapeAllCourseDetails(
  page: Page,
  courses: CourseData[]
): Promise<{ allTasks: TaskData[]; courseZoomLinks: Map<string, string[]> }> {
  const allTasks: TaskData[] = [];
  const courseZoomLinks = new Map<string, string[]>();

  for (const course of courses) {
    const details = await scrapeCourseDetail(page, course);
    allTasks.push(...details.tasks);

    if (details.zoomLinks.length > 0) {
      courseZoomLinks.set(course.id, details.zoomLinks);
    }
  }

  logger.info({
    totalTasks: allTasks.length,
    coursesWithZoom: courseZoomLinks.size,
  }, 'All course details scraped');

  return { allTasks, courseZoomLinks };
}
