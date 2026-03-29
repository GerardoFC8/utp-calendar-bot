import type { Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { type CourseData, cleanText } from './parser.js';
import { takeScreenshot } from './browser.js';
import type { InterceptedData } from './interceptor.js';

export async function scrapeCourses(
  page: Page,
  intercepted: InterceptedData,
): Promise<CourseData[]> {
  const coursesUrl = `${config.UTP_BASE_URL}${config.UTP_COURSES_PATH}`;
  logger.info({ url: coursesUrl }, 'Navigating to courses');

  // The SPA may have already fired the dashboard-courses API call during
  // the login redirect. We keep whatever was captured — but we'll also
  // force a fresh call by navigating to the courses page.
  const preExisting = intercepted.courses.length;
  if (preExisting > 0) {
    logger.info(
      { preExisting },
      'Courses already intercepted (likely from login redirect) — will use them',
    );
  }

  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Wait for a NEW dashboard-courses API call if none existed before
  if (preExisting === 0) {
    const maxWaitMs = 15_000;
    const pollInterval = 500;
    const deadline = Date.now() + maxWaitMs;
    while (intercepted.courses.length === 0 && Date.now() < deadline) {
      await page.waitForTimeout(pollInterval);
    }

    if (intercepted.courses.length === 0) {
      logger.warn('No courses API data after initial wait — reloading page');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      const retryDeadline = Date.now() + 10_000;
      while (intercepted.courses.length === 0 && Date.now() < retryDeadline) {
        await page.waitForTimeout(pollInterval);
      }
    }
  } else {
    // Even if we already have data, wait briefly for a fresh response
    await page.waitForTimeout(3_000);
  }

  if (intercepted.courses.length === 0) {
    await takeScreenshot(page, 'courses-no-api-data');
    logger.warn('No courses API data intercepted after retry');
    return [];
  }

  // Log raw data for diagnosis
  logger.info(
    { interceptedCount: intercepted.courses.length },
    'Parsing courses from intercepted data',
  );

  const courses = parseCoursesFromAPI(intercepted.courses);

  // Section details (currentWeek, totalWeeks) are enriched AFTER individual
  // course pages are visited by scrapeUnreadComments in cron.ts. Don't
  // navigate to courses here — it doubles the scrape time and is redundant.
  enrichCoursesWithSectionDetails(courses, intercepted.sectionDetails);

  logger.info({ count: courses.length }, 'Courses scraped');
  return courses;
}

// ============================================================
// API-based parsing — /learning/student/{userId}/dashboard-courses
// ============================================================

function parseCoursesFromAPI(apiData: unknown[]): CourseData[] {
  const courses: CourseData[] = [];
  const seenIds = new Set<string>();

  for (const response of apiData) {
    const items = extractArray(response);

    logger.info(
      { itemsFound: items.length, responseType: typeof response },
      'Processing courses API response',
    );

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      try {
        const course = parseDashboardCourseItem(obj);
        if (!course) {
          logger.debug(
            { courseId: obj['courseId'], classroom: obj['classroom'], name: obj['name'] },
            'parseDashboardCourseItem returned null — missing courseId or name',
          );
          continue;
        }

        // Skip non-academic courses (institutional extras)
        if (course.acadCareer !== 'PREG') {
          logger.debug(
            { name: course.name, acadCareer: course.acadCareer },
            'Skipping non-academic course',
          );
          continue;
        }

        // Deduplicate by courseId
        if (seenIds.has(course.id)) continue;
        seenIds.add(course.id);

        courses.push(course);
      } catch (err) {
        logger.debug({ err }, 'Failed to parse dashboard course item');
      }
    }
  }

  logger.info({ count: courses.length }, 'Courses parsed from dashboard-courses API');
  return courses;
}

function parseDashboardCourseItem(obj: Record<string, unknown>): CourseData | null {
  const courseId = obj['courseId'] as string;
  // PREG courses have classroom=null but name set; PRED courses have both
  const name = (obj['classroom'] as string) || (obj['name'] as string);

  if (!courseId || !name) return null;

  const sectionId = (obj['sectionId'] as string) ?? '';
  const classNumber = (obj['classNumber'] as string) ?? '';
  const modality = (obj['modality'] as string) ?? 'VT';
  const acadCareer = (obj['acadCareer'] as string) ?? 'PREG';
  const period = (obj['period'] as string) ?? '';
  const progress = (obj['progress'] as number) ?? 0;

  // Teacher info — prefer direct fields, fallback to teachers array
  let teacherFirstName = (obj['teacherFirstName'] as string) ?? '';
  let teacherLastName = (obj['teacherLastName'] as string) ?? '';
  let teacherEmail = (obj['teacherEmail'] as string) ?? '';

  if (!teacherFirstName && Array.isArray(obj['teachers']) && obj['teachers'].length > 0) {
    const teacher = obj['teachers'][0] as Record<string, unknown>;
    teacherFirstName = (teacher['teacherFirstName'] as string) ?? '';
    teacherLastName = (teacher['teacherLastName'] as string) ?? '';
    teacherEmail = (teacher['teacherEmail'] as string) ?? '';
  }

  return {
    id: courseId,
    sectionId,
    name: cleanText(name),
    classNumber,
    modality,
    acadCareer,
    period,
    teacherFirstName: cleanText(teacherFirstName),
    teacherLastName: cleanText(teacherLastName),
    teacherEmail: teacherEmail.toLowerCase().trim(),
    progress,
  };
}

// ============================================================
// Section detail enrichment — adds currentWeek / totalWeeks to courses
// ============================================================

export function enrichCoursesWithSectionDetails(courses: CourseData[], sectionDetails: unknown[]): void {
  for (const response of sectionDetails) {
    if (!response || typeof response !== 'object') continue;
    const obj = response as Record<string, unknown>;
    const data = obj['data'] as Record<string, unknown> | undefined;
    if (!data) continue;

    const courseId = data['courseId'] as string | undefined;
    const currentWeek = data['currentWeek'] as number | undefined;
    const numWeeks = data['numWeeks'] as number | undefined;

    if (!courseId) continue;

    const course = courses.find(c => c.id === courseId);
    if (course) {
      course.currentWeek = currentWeek;
      course.totalWeeks = numWeeks;
      logger.debug(
        { courseId, currentWeek, numWeeks },
        'Enriched course with section detail week info',
      );
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function extractArray(response: unknown): unknown[] {
  if (!response || typeof response !== 'object') return [];
  const obj = response as Record<string, unknown>;

  // Structure: { data: [...] }
  if (Array.isArray(obj['data'])) return obj['data'];

  // Try as direct array
  if (Array.isArray(response)) return response;

  return [];
}
