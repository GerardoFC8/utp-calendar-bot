import type { Page, Response } from 'playwright';
import { logger } from '../logger.js';

export interface InterceptedData {
  userId: string | null;
  calendarEvents: unknown[];
  calendarActivities: unknown[];
  courses: unknown[];
  pendingActivities: unknown[];
  academicPeriods: unknown[];
  apiEndpoints: Map<string, string>;
}

const API_HOST = 'api-pao.utpxpedition.com';

// Extract userId UUID from API URLs.
// The UUID appears either in the path (/student/{uuid}/) or as a query param (?userId={uuid}).
function extractUserId(url: string): string | null {
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  const pathMatch = url.match(new RegExp(`/student/(${uuidPattern})`, 'i'));
  if (pathMatch) return pathMatch[1];

  const queryMatch = url.match(new RegExp(`userId=(${uuidPattern})`, 'i'));
  if (queryMatch) return queryMatch[1];

  return null;
}

export function createInterceptor(page: Page): InterceptedData {
  const data: InterceptedData = {
    userId: null,
    calendarEvents: [],
    calendarActivities: [],
    courses: [],
    pendingActivities: [],
    academicPeriods: [],
    apiEndpoints: new Map(),
  };

  page.on('response', async (response: Response) => {
    const url = response.url();

    // Only intercept calls to the real UTP+ backend API
    if (!url.includes(API_HOST)) return;

    const status = response.status();
    if (status < 200 || status >= 300) return;

    try {
      const body = await response.json();
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // Extract userId from URL on first opportunity
      if (!data.userId) {
        const userId = extractUserId(url);
        if (userId) {
          data.userId = userId;
          logger.info({ userId }, 'User ID extracted from API call');
        }
      }

      // Categorize by endpoint path — order matters: check more specific paths first
      if (path.includes('/calendar/activities')) {
        data.calendarActivities.push(body);
        data.apiEndpoints.set('calendarActivities', `${urlObj.origin}${path}`);
        logger.info(
          { path, items: Array.isArray(body) ? body.length : 'object' },
          'Calendar activities intercepted',
        );
      } else if (path.includes('/calendar')) {
        data.calendarEvents.push(body);
        data.apiEndpoints.set('calendar', `${urlObj.origin}${path}`);
        logger.info(
          { path, items: Array.isArray(body) ? body.length : 'object' },
          'Calendar events intercepted',
        );
      } else if (path.includes('/dashboard-courses')) {
        data.courses.push(body);
        data.apiEndpoints.set('courses', `${urlObj.origin}${path}`);
        logger.info(
          { path, items: Array.isArray(body) ? body.length : 'object' },
          'Courses intercepted',
        );
      } else if (path.includes('/activities/pending')) {
        data.pendingActivities.push(body);
        data.apiEndpoints.set('pendingActivities', `${urlObj.origin}${path}`);
        logger.info({ path }, 'Pending activities intercepted');
      } else if (path.includes('/academicperiods')) {
        data.academicPeriods.push(body);
        data.apiEndpoints.set('academicPeriods', `${urlObj.origin}${path}`);
        logger.info({ path }, 'Academic periods intercepted');
      }

      logger.debug({ path, status }, 'API call intercepted');
    } catch {
      // Not JSON or response body could not be read — skip silently
    }
  });

  return data;
}

export function logDiscoveredEndpoints(data: InterceptedData): void {
  if (data.apiEndpoints.size === 0) {
    logger.warn('No API endpoints captured during this session');
    return;
  }

  logger.info({ count: data.apiEndpoints.size, userId: data.userId }, 'API endpoints discovered');
  for (const [category, url] of data.apiEndpoints) {
    logger.info({ category, url }, 'Endpoint');
  }
}
