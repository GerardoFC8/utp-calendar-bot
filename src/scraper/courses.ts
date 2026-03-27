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

  // Use 'domcontentloaded' — the SPA never reaches 'networkidle' due to
  // background requests (analytics, keep-alive). The data we need comes from
  // intercepted API calls, not from the DOM.
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Wait for the SPA to trigger the dashboard-courses API call
  await page.waitForTimeout(5_000);

  if (intercepted.courses.length === 0) {
    await takeScreenshot(page, 'courses-no-api-data');
    logger.warn('No courses API data intercepted');
    return [];
  }

  const courses = parseCoursesFromAPI(intercepted.courses);
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

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      try {
        const course = parseDashboardCourseItem(obj);
        if (!course) continue;

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
  const name = obj['classroom'] as string; // "classroom" = course display name in API

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
