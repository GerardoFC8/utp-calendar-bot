import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getClassesForDate } from '../db/queries.js';
import type { ClassRow } from '../db/queries.js';
import { sendClassReminder } from '../bot/notifications.js';
import type { ClassData } from '../scraper/parser.js';

function mapClassRow(row: ClassRow): ClassData {
  return {
    id: row.id,
    title: row.title,
    courseId: row.courseId ?? '',
    sectionId: row.sectionId ?? '',
    modality: row.modality ?? 'R',
    startAt: row.startAt,
    finishAt: row.finishAt,
    zoomLink: row.zoomLink ?? undefined,
    weekNumber: row.weekNumber ?? undefined,
    isLongLasting: Boolean(row.isLongLasting),
  };
}

// Track sent reminders to avoid duplicates
const sentReminders = new Set<string>();

export async function checkUpcomingClasses(bot: Telegraf): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const rawClasses = getClassesForDate(todayStr);
  const classes = rawClasses.map(mapClassRow);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const cls of classes) {
    // Extract HH:MM from "2026-03-28 18:30:00"
    const timeParts = cls.startAt.split(' ')[1]?.split(':') ?? [];
    const hours = parseInt(timeParts[0] ?? '0', 10);
    const minutes = parseInt(timeParts[1] ?? '0', 10);
    const classMinutes = hours * 60 + minutes;
    const diff = classMinutes - currentMinutes;

    // Check if class is within reminder window
    if (diff > 0 && diff <= config.CLASS_REMINDER_MINUTES) {
      const reminderId = `${cls.id}-${todayStr}`;

      if (!sentReminders.has(reminderId)) {
        await sendClassReminder(bot, cls);
        sentReminders.add(reminderId);
        logger.info({ class: cls.title, inMinutes: diff }, 'Class reminder sent');
      }
    }
  }

  // Clean old reminders (from previous days)
  for (const key of sentReminders) {
    if (!key.endsWith(todayStr)) {
      sentReminders.delete(key);
    }
  }
}

export function clearSentReminders(): void {
  sentReminders.clear();
}
