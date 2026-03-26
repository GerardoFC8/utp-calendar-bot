// ============================================================
// Types — API-first data structures
// ============================================================

export interface CourseData {
  id: string;           // courseId from API
  sectionId: string;
  name: string;         // classroom field from API
  classNumber: string;
  modality: string;     // VT = virtual 24/7, R = en vivo
  acadCareer: string;   // PREG = real academic, PRED = institutional
  period: string;       // e.g. "2262" = 2026-1
  teacherFirstName: string;
  teacherLastName: string;
  teacherEmail: string;
  progress: number;
}

export interface ClassData {
  id: string;           // API event uuid
  title: string;
  courseId: string;
  sectionId: string;
  modality: string;     // R or VT
  startAt: string;      // ISO datetime "2026-03-28 18:30:00"
  finishAt: string;     // ISO datetime
  zoomLink?: string;
  weekNumber?: number;
  isLongLasting: boolean;
}

export interface ActivityData {
  id: string;           // activityId from API
  title: string;
  activityType: string; // FORUM, HOMEWORK, EVALUATION
  courseName: string;
  courseId: string;
  publishAt: string;    // ISO datetime
  finishAt: string;     // ISO datetime — DEADLINE
  weekNumber: number;
  studentStatus: string;
  evaluationSystem?: string;
  isQualificated: boolean;
}

// ============================================================
// Utility functions
// ============================================================

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

// Extract the date part "YYYY-MM-DD" from an ISO datetime string
export function extractDatePart(datetime: string): string {
  return datetime.split(' ')[0] ?? datetime.split('T')[0] ?? datetime;
}

// Extract the time part "HH:MM" from an ISO datetime string "YYYY-MM-DD HH:MM:SS"
export function extractTimePart(datetime: string): string {
  const parts = datetime.split(' ');
  if (parts.length >= 2) {
    const timeParts = (parts[1] ?? '').split(':');
    return `${timeParts[0] ?? '00'}:${timeParts[1] ?? '00'}`;
  }
  return '00:00';
}

// Format an ISO datetime like "2026-03-28 18:30:00" to "18:30"
export function formatTime(datetime: string): string {
  return extractTimePart(datetime);
}
