import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getClassesByDay } from '../db/queries.js';
import { getDayName } from '../scraper/parser.js';
import { sendClassReminder } from '../bot/notifications.js';
import type { ClassData } from '../scraper/parser.js';

// Track sent reminders to avoid duplicates
const sentReminders = new Set<string>();

export async function checkUpcomingClasses(bot: Telegraf): Promise<void> {
  const now = new Date();
  const dayName = getDayName(now);
  const classes = getClassesByDay(dayName) as ClassData[];

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const cls of classes) {
    const [hours, minutes] = cls.startTime.split(':').map(Number);
    const classMinutes = hours * 60 + minutes;
    const diff = classMinutes - currentMinutes;

    // Check if class is within reminder window
    if (diff > 0 && diff <= config.CLASS_REMINDER_MINUTES) {
      const reminderId = `${cls.id}-${now.toISOString().split('T')[0]}`;

      if (!sentReminders.has(reminderId)) {
        await sendClassReminder(bot, cls);
        sentReminders.add(reminderId);
        logger.info({ class: cls.name, inMinutes: diff }, 'Class reminder sent');
      }
    }
  }

  // Clean old reminders (from previous days)
  const todayPrefix = now.toISOString().split('T')[0];
  for (const key of sentReminders) {
    if (!key.endsWith(todayPrefix)) {
      sentReminders.delete(key);
    }
  }
}

export function clearSentReminders(): void {
  sentReminders.clear();
}
