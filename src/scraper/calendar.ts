import type { Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { type ClassData, cleanText, parseTime, generateClassId } from './parser.js';
import { takeScreenshot } from './browser.js';
import type { InterceptedData } from './interceptor.js';

// Maps Spanish day abbreviations (from the calendar column headers) to full names.
// The header format is "Lun 23", "Mar 24", "Mié 25", etc.
const DAY_ABBREVIATIONS: Record<string, string> = {
  Lun: 'Lunes',
  Mar: 'Martes',
  'Mié': 'Miercoles',
  Mir: 'Miercoles', // fallback without accent
  Jue: 'Jueves',
  Vie: 'Viernes',
  'Sáb': 'Sabado',
  Sab: 'Sabado',
  Dom: 'Domingo',
};

export async function scrapeCalendar(page: Page, intercepted?: InterceptedData): Promise<ClassData[]> {
  const calendarUrl = `${config.UTP_BASE_URL}${config.UTP_CALENDAR_PATH}`;
  logger.info({ url: calendarUrl }, 'Navigating to calendar');

  await page.goto(calendarUrl, { waitUntil: 'networkidle' });

  // Wait for the ARIA grid rendered by the SPA calendar component
  try {
    await page.waitForSelector('[role="grid"]', { timeout: 15_000 });
    logger.info('Calendar grid found');
  } catch {
    await takeScreenshot(page, 'calendar-not-found');
    logger.warn('Calendar grid not found');
    return [];
  }

  // Give the SPA extra time to populate events inside the grid
  await page.waitForTimeout(2_000);

  // Strategy 1: Use intercepted API data (preferred — more reliable than DOM parsing)
  if (intercepted && intercepted.calendarEvents.length > 0) {
    logger.info('Using intercepted calendar API data');
    try {
      return parseCalendarFromAPI(intercepted.calendarEvents);
    } catch (error) {
      logger.warn({ error }, 'Failed to parse intercepted calendar data, falling back to DOM');
    }
  }

  // Strategy 2: DOM scraping
  logger.info('Scraping calendar from DOM');
  return scrapeCalendarFromDOM(page);
}

// ============================================================
// API-based parsing
// ============================================================

function parseCalendarFromAPI(apiData: unknown[]): ClassData[] {
  const classes: ClassData[] = [];

  for (const data of apiData) {
    if (Array.isArray(data)) {
      for (const item of data) {
        try {
          const classData = parseAPICalendarItem(item);
          if (classData) classes.push(classData);
        } catch {
          // Skip items that don't match expected structure
        }
      }
    } else if (data && typeof data === 'object') {
      // Response may wrap the array in a property
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            try {
              const classData = parseAPICalendarItem(item);
              if (classData) classes.push(classData);
            } catch {
              // Skip
            }
          }
        }
      }
    }
  }

  logger.info({ count: classes.length }, 'Classes parsed from API data');
  return classes;
}

function parseAPICalendarItem(item: unknown): ClassData | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  // Try common field names that the real API might use
  const name = (obj['name'] ?? obj['courseName'] ?? obj['title'] ?? obj['subject'] ?? '') as string;
  if (!name) return null;

  const startTime = (obj['startTime'] ?? obj['start'] ?? obj['timeStart'] ?? '') as string;
  const endTime = (obj['endTime'] ?? obj['end'] ?? obj['timeEnd'] ?? '') as string;
  const day = (obj['day'] ?? obj['dayName'] ?? obj['weekDay'] ?? '') as string;
  const room = (obj['room'] ?? obj['classroom'] ?? obj['location'] ?? '') as string;
  const professor = (obj['professor'] ?? obj['teacher'] ?? obj['instructor'] ?? '') as string;
  const zoomLink = (obj['zoomLink'] ?? obj['meetingUrl'] ?? obj['zoom'] ?? '') as string;
  const section = (obj['section'] ?? obj['sectionCode'] ?? '') as string;

  return {
    id: generateClassId(cleanText(name), day || 'Unknown', startTime ? parseTime(startTime) : '00:00'),
    name: cleanText(name),
    professor: professor ? cleanText(professor) : undefined,
    day: day || 'Unknown',
    startTime: startTime ? parseTime(startTime) : '00:00',
    endTime: endTime ? parseTime(endTime) : '00:00',
    room: room ? cleanText(room) : undefined,
    zoomLink: zoomLink || undefined,
    section: section ? cleanText(section) : undefined,
  };
}

// ============================================================
// DOM-based parsing (fallback)
// ============================================================

async function scrapeCalendarFromDOM(page: Page): Promise<ClassData[]> {
  // Read the column header texts to build a map of column index -> day abbreviation
  const dayHeaders = await page.$$eval('[role="columnheader"]', (headers) =>
    headers.map((h, index) => ({
      index,
      text: (h.textContent ?? '').trim(),
    })),
  );

  const dayMap: Record<number, string> = {};
  for (const header of dayHeaders) {
    // Header format: "Lun 23", "Mar 24", "Mié 25" — take the first word
    const abbr = header.text.split(/\s+/)[0] ?? '';
    dayMap[header.index] = abbr;
  }

  logger.info({ dayHeaders: dayHeaders.map((h) => h.text) }, 'Calendar day headers');

  // Extract raw event data from gridcells using page.evaluate for DOM access
  const rawEvents = await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]');
    if (!grid) return [];

    const events: Array<{ columnIndex: number; texts: string[] }> = [];

    // Iterate all rows that hold event data (skip the header rowgroup)
    const rowgroups = grid.querySelectorAll('[role="rowgroup"]');
    // Use the last rowgroup which contains the actual day cells (first is the header)
    const bodyRowgroup = rowgroups[rowgroups.length - 1] ?? grid;
    const rows = bodyRowgroup.querySelectorAll('[role="row"]');

    for (const row of rows) {
      const cells = row.querySelectorAll('[role="gridcell"]');

      cells.forEach((cell, colIndex) => {
        // Events are clickable containers — the SPA sets cursor:pointer via inline style
        // We look for elements with inline style containing "cursor" or direct p children
        const clickables = cell.querySelectorAll('[style*="cursor"]');

        if (clickables.length === 0) {
          // Fallback: look for cells that contain paragraphs with time info
          const paragraphs = cell.querySelectorAll('p');
          if (paragraphs.length >= 2) {
            const texts = Array.from(paragraphs)
              .map((p) => (p.textContent ?? '').trim())
              .filter((t) => t.length > 0);
            const hasTime = texts.some((t) => t.includes('a.m.') || t.includes('p.m.') || /\d:\d{2}/.test(t));
            if (hasTime) {
              events.push({ columnIndex: colIndex, texts });
            }
          }
          return;
        }

        for (const clickable of clickables) {
          const paragraphs = clickable.querySelectorAll('p');
          const texts = Array.from(paragraphs)
            .map((p) => (p.textContent ?? '').trim())
            .filter((t) => t.length > 0);
          if (texts.length >= 2) {
            events.push({ columnIndex: colIndex, texts });
          }
        }
      });
    }

    return events;
  });

  logger.info({ rawEventsCount: rawEvents.length }, 'Raw events extracted from DOM');

  const classes: ClassData[] = [];

  for (const event of rawEvents) {
    // Expected text layout per event:
    //   texts[0] = "Individuo y Medio Ambiente 8144"  (course name + section code)
    //   texts[1] = "10:00 a.m. - 10:45 a.m."          (time range)
    //   texts[2] = "Virtual en vivo"                   (optional modality label)

    if (event.texts.length < 2) continue;

    const nameText = event.texts[0] ?? '';
    const timeText = event.texts[1] ?? '';

    // Only parse entries that have a proper time range — skip pure activity entries
    const timeMatch = timeText.match(
      /(\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?)\s*[-\u2013]\s*(\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?)/i,
    );
    if (!timeMatch) continue;

    const startTime = parseTime(timeMatch[1] ?? '');
    const endTime = parseTime(timeMatch[2] ?? '');

    // Map column index to day name
    const dayAbbr = dayMap[event.columnIndex] ?? '';
    const day = (DAY_ABBREVIATIONS[dayAbbr] ?? dayAbbr) || 'Unknown';

    // Strip the trailing section code (4-5 digit number) from the course name
    const sectionMatch = nameText.match(/(\d{4,5})\s*$/);
    const section = sectionMatch?.[1];
    const name = cleanText(nameText.replace(/\s+\d{4,5}\s*$/, '').replace(/\s*\(.*?\)\s*$/, ''));

    if (!name) continue;

    classes.push({
      id: generateClassId(name, day, startTime),
      name,
      day,
      startTime,
      endTime,
      section,
    });
  }

  logger.info({ count: classes.length }, 'Classes parsed from DOM');
  return classes;
}
