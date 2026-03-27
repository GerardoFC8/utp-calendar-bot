import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  getClassesForDate,
  hasReminderBeenSent,
  markReminderSent,
  cleanOldReminders,
  getActivitiesDueSoon,
  hasActivityReminderBeenSent,
  markActivityReminderSent,
  cleanOldActivityReminders,
  getSetting,
} from '../db/queries.js';
import type { ClassRow, ActivityRow } from '../db/queries.js';
import { sendClassReminder, sendDeadlineReminder } from '../bot/notifications.js';
import type { ClassData, ActivityData } from '../scraper/parser.js';

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

function mapActivityRow(row: ActivityRow): ActivityData {
  return {
    id: row.id,
    title: row.title,
    activityType: row.activityType,
    courseName: row.courseName,
    courseId: row.courseId ?? '',
    publishAt: row.publishAt ?? '',
    finishAt: row.finishAt,
    weekNumber: row.weekNumber ?? 0,
    studentStatus: row.studentStatus ?? 'PENDING',
    evaluationSystem: row.evaluationSystem ?? undefined,
    isQualificated: Boolean(row.isQualificated),
  };
}

export async function checkUpcomingClasses(bot: Telegraf): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const rawClasses = getClassesForDate(todayStr);
  const classes = rawClasses.map(mapClassRow);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Read reminder minutes from DB settings (falls back to config)
  const minutesSetting = getSetting('reminder_class_minutes');
  const reminderMinutes = minutesSetting ? parseInt(minutesSetting, 10) : config.CLASS_REMINDER_MINUTES;

  for (const cls of classes) {
    // Extract HH:MM from "2026-03-28 18:30:00"
    const timeParts = cls.startAt.split(' ')[1]?.split(':') ?? [];
    const hours = parseInt(timeParts[0] ?? '0', 10);
    const minutes = parseInt(timeParts[1] ?? '0', 10);
    const classMinutes = hours * 60 + minutes;
    const diff = classMinutes - currentMinutes;

    // Check if class is within reminder window
    if (diff > 0 && diff <= reminderMinutes) {
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

export async function checkUpcomingDeadlines(bot: Telegraf): Promise<void> {
  const now = new Date();

  // Check if deadline reminders are enabled
  const enabled24h = getSetting('reminder_deadline_24h') !== 'false';
  const enabled2h = getSetting('reminder_deadline_2h') !== 'false';

  // Get activities due in next 2 days (covers both 24h and 2h windows)
  const rawActivities = getActivitiesDueSoon(2);

  for (const row of rawActivities) {
    const activity = mapActivityRow(row);
    const deadline = new Date(activity.finishAt.replace(' ', 'T'));
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    // 24h reminder: between 23-25 hours left
    if (enabled24h && hoursLeft > 23 && hoursLeft <= 25) {
      if (!hasActivityReminderBeenSent(activity.id, '24h')) {
        await sendDeadlineReminder(bot, activity, 24);
        markActivityReminderSent(activity.id, '24h');
        logger.info({ activity: activity.title, hours: 24 }, 'Deadline reminder sent');
      }
    }

    // 2h reminder: between 1.5-2.5 hours left
    if (enabled2h && hoursLeft > 1.5 && hoursLeft <= 2.5) {
      if (!hasActivityReminderBeenSent(activity.id, '2h')) {
        await sendDeadlineReminder(bot, activity, 2);
        markActivityReminderSent(activity.id, '2h');
        logger.info({ activity: activity.title, hours: 2 }, 'Deadline reminder sent');
      }
    }
  }

  // Clean old reminders for activities that have already passed
  cleanOldActivityReminders();
}
