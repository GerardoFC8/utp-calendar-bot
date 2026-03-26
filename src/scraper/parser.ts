import { createHash } from 'node:crypto';

// === Types ===
export interface ClassData {
  id: string;
  name: string;
  professor?: string;
  day: string;
  startTime: string;
  endTime: string;
  room?: string;
  zoomLink?: string;
  section?: string;
}

export interface TaskData {
  id: string;
  name: string;
  subject?: string;
  dueDate: string;  // ISO format: YYYY-MM-DD
  description?: string;
  zoomLink?: string;
  status: 'pending' | 'done';
}

export interface CourseData {
  id: string;
  name: string;
  code?: string;
  section?: string;
  professor?: string;
  zoomLink?: string;
  internalUrl?: string;
}

// === ID Generators ===
export function generateClassId(name: string, day: string, startTime: string): string {
  const raw = `${name}-${day}-${startTime}`.toLowerCase().trim();
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

export function generateTaskId(name: string, dueDate: string): string {
  const raw = `${name}-${dueDate}`.toLowerCase().trim();
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

export function generateCourseId(name: string, section?: string): string {
  const raw = `${name}-${section || 'default'}`.toLowerCase().trim();
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

// === Parsers ===
export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

export function parseTime(timeStr: string): string {
  // Normalize time formats: "8:00 AM" -> "08:00", "14:00" -> "14:00"
  const cleaned = cleanText(timeStr);

  // Handle 12-hour format
  const match12 = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const period = match12[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Handle 24-hour format
  const match24 = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}`;
  }

  return cleaned;
}

export function parseDate(dateStr: string): string {
  // Try to normalize to ISO format YYYY-MM-DD
  const cleaned = cleanText(dateStr);

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // DD/MM/YYYY
  const matchDMY = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchDMY) {
    return `${matchDMY[3]}-${matchDMY[2].padStart(2, '0')}-${matchDMY[1].padStart(2, '0')}`;
  }

  // MM/DD/YYYY
  const matchMDY = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchMDY) {
    // Assume DD/MM/YYYY for Peru locale
    return `${matchMDY[3]}-${matchMDY[2].padStart(2, '0')}-${matchMDY[1].padStart(2, '0')}`;
  }

  return cleaned;
}

export function extractZoomLink(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s]*zoom\.[^\s]*/i);
  return match ? match[0] : undefined;
}

export function getDayName(date: Date): string {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return days[date.getDay()];
}

export function parseClassesFromDOM(elements: Array<{
  title?: string;
  time?: string;
  detail?: string;
  room?: string;
  professor?: string;
  zoomLink?: string;
}>): ClassData[] {
  return elements
    .filter((el) => el.title && el.time)
    .map((el) => {
      const name = cleanText(el.title);
      const timeRange = cleanText(el.time);
      const [startTime, endTime] = timeRange.split('-').map((t) => parseTime(t.trim()));
      const day = getDayName(new Date()); // Will be overridden with actual day from calendar

      return {
        id: generateClassId(name, day, startTime || '00:00'),
        name,
        professor: el.professor ? cleanText(el.professor) : undefined,
        day,
        startTime: startTime || '00:00',
        endTime: endTime || '00:00',
        room: el.room ? cleanText(el.room) : undefined,
        zoomLink: el.zoomLink || (el.detail ? extractZoomLink(el.detail) : undefined),
      };
    });
}

export function parseTasksFromDOM(elements: Array<{
  title?: string;
  dueDate?: string;
  subject?: string;
  description?: string;
}>): TaskData[] {
  return elements
    .filter((el) => el.title && el.dueDate)
    .map((el) => {
      const name = cleanText(el.title);
      const dueDate = parseDate(cleanText(el.dueDate));

      return {
        id: generateTaskId(name, dueDate),
        name,
        subject: el.subject ? cleanText(el.subject) : undefined,
        dueDate,
        description: el.description ? cleanText(el.description) : undefined,
        status: 'pending' as const,
      };
    });
}
