import type { Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { type CourseData, cleanText, generateCourseId } from './parser.js';
import { takeScreenshot } from './browser.js';
import type { InterceptedData } from './interceptor.js';

export async function scrapeCourses(page: Page, intercepted?: InterceptedData): Promise<CourseData[]> {
  const coursesUrl = `${config.UTP_BASE_URL}${config.UTP_COURSES_PATH}`;
  logger.info({ url: coursesUrl }, 'Navigating to courses');

  await page.goto(coursesUrl, { waitUntil: 'networkidle' });
  // Extra wait for the SPA to finish rendering cards
  await page.waitForTimeout(3_000);

  // Strategy 1: Use intercepted API data (preferred)
  if (intercepted && intercepted.courses.length > 0) {
    logger.info('Using intercepted courses API data');
    try {
      return parseCoursesFromAPI(intercepted.courses);
    } catch (error) {
      logger.warn({ error }, 'Failed to parse intercepted courses, falling back to DOM');
    }
  }

  // Strategy 2: DOM scraping
  logger.info('Scraping courses from DOM');

  try {
    // Course cards are anchor elements with URLs matching /student/courses/{uuid}/…/learnv2
    await page.waitForSelector('a[href*="/student/courses/"][href*="/learnv2"]', { timeout: 15_000 });
  } catch {
    await takeScreenshot(page, 'courses-not-found');
    logger.warn('No course links found');
    return [];
  }

  const rawCourses = await page.$$eval(
    'a[href*="/student/courses/"][href*="/learnv2"]',
    (links) =>
      links.map((link) => {
        const anchor = link as HTMLAnchorElement;
        // Collect text from inner structural elements — paragraphs, spans, divs
        const nodes = anchor.querySelectorAll('p, span, div');
        const texts: string[] = [];
        nodes.forEach((node) => {
          const t = (node.textContent ?? '').trim();
          // Avoid duplicates from nested elements and ignore very short fragments
          if (t.length > 1 && !texts.includes(t)) texts.push(t);
        });

        return {
          url: anchor.getAttribute('href') ?? '',
          texts,
        };
      }),
  );

  logger.info({ count: rawCourses.length }, 'Raw course links extracted');

  const courses: CourseData[] = [];
  const seen = new Set<string>();

  for (const raw of rawCourses) {
    if (!raw.url || seen.has(raw.url)) continue;
    seen.add(raw.url);

    // Filter out noise: progress percentages like "3%", theme icons, and empty strings
    const relevantTexts = raw.texts.filter((t) => !t.match(/^\d+%$/) && t !== 'theme' && t.length > 2);

    // Expected order: course name, section info ("12345 - Virtual 24/7"), professor name
    const courseName = relevantTexts[0] ?? '';
    const sectionInfo = relevantTexts[1] ?? ''; // e.g. "13926 - Virtual 24/7"
    const professor = relevantTexts[2] ?? '';

    if (!courseName) continue;

    // Extract the numeric section code from the section info string
    const sectionCode = sectionInfo.match(/^(\d+)/)?.[1];

    const name = cleanText(courseName);
    const section = sectionCode;

    courses.push({
      id: generateCourseId(name, section),
      name,
      code: sectionCode,
      section,
      professor: professor ? cleanText(professor) : undefined,
      internalUrl: raw.url.startsWith('http') ? raw.url : `${config.UTP_BASE_URL}${raw.url}`,
    });
  }

  logger.info({ count: courses.length }, 'Courses parsed');
  return courses;
}

// ============================================================
// API-based parsing
// ============================================================

function parseCoursesFromAPI(apiData: unknown[]): CourseData[] {
  const courses: CourseData[] = [];

  for (const data of apiData) {
    if (Array.isArray(data)) {
      for (const item of data) {
        const course = parseAPICourseItem(item);
        if (course) courses.push(course);
      }
    } else if (data && typeof data === 'object') {
      // Response may wrap the array in a property
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            const course = parseAPICourseItem(item);
            if (course) courses.push(course);
          }
        }
      }
    }
  }

  logger.info({ count: courses.length }, 'Courses parsed from API data');
  return courses;
}

function parseAPICourseItem(item: unknown): CourseData | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const name = (obj['name'] ?? obj['courseName'] ?? obj['title'] ?? '') as string;
  if (!name) return null;

  const code = (obj['code'] ?? obj['courseCode'] ?? obj['sectionCode'] ?? '') as string;
  const section = (obj['section'] ?? obj['sectionId'] ?? '') as string;
  const professor = (obj['professor'] ?? obj['teacher'] ?? obj['instructorName'] ?? '') as string;

  const cleanName = cleanText(name);

  return {
    id: generateCourseId(cleanName, code || undefined),
    name: cleanName,
    code: code ? cleanText(code) : undefined,
    section: section ? cleanText(section) : undefined,
    professor: professor ? cleanText(professor) : undefined,
  };
}
