import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getClassesForDate, hasReminderBeenSent, markReminderSent, cleanOldReminders } from '../db/queries.js';
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
      if (!hasReminderBeenSent(cls.id, todayStr)) {
        await sendClassReminder(bot, cls);
        markReminderSent(cls.id, todayStr);
        logger.info({ class: cls.title, inMinutes: diff }, 'Class reminder sent');
      }
    }
  }

  // Clean reminders from previous days
  cleanOldReminders(todayStr);
}
