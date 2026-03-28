import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getClassesForDate, getPendingActivities } from '../db/queries.js';
import type { ClassRow, ActivityRow } from '../db/queries.js';
import {
  formatDailySchedule,
  formatChangeNotification,
  formatDeadlineReminder,
  escapeMarkdown,
} from './formatters.js';
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

export async function sendMessage(
  bot: Telegraf,
  text: string,
  parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2',
): Promise<void> {
  try {
    await bot.telegram.sendMessage(config.TELEGRAM_CHAT_ID, text, {
      parse_mode: parseMode,
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send Telegram message');
    // Retry without markdown if formatting fails
    if (parseMode === 'MarkdownV2') {
      try {
        const plainText = text.replace(/[\\*_`[\]()~>#+\-=|{}.!]/g, '');
        await bot.telegram.sendMessage(config.TELEGRAM_CHAT_ID, plainText);
      } catch (retryError) {
        logger.error({ retryError }, 'Failed to send plain text message too');
      }
    }
  }
}

export async function sendMorningReminder(bot: Telegraf): Promise<void> {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const classes = getClassesForDate(todayStr).map(mapClassRow) as ClassData[];
  const allActivities = getPendingActivities().map(mapActivityRow) as ActivityData[];

  // Filter activities due today
  const todayActivities = allActivities.filter((a) => {
    const activityDate = a.finishAt.split(' ')[0] ?? '';
    return activityDate === todayStr;
  });

  if (classes.length === 0 && todayActivities.length === 0) {
    logger.info('No classes or activities today, skipping morning reminder');
    return;
  }

  const message = formatDailySchedule(today, classes, todayActivities, 'Buenos dias');

  await sendMessage(bot, message);
  logger.info('Morning reminder sent');
}

export async function sendClassReminder(bot: Telegraf, classData: ClassData): Promise<void> {
  const title = escapeMarkdown(classData.title);
  const timeParts = classData.startAt.split(' ');
  const time = escapeMarkdown(timeParts[1]?.substring(0, 5) ?? classData.startAt);

  let message = `En ${config.CLASS_REMINDER_MINUTES} minutos: *${title}* \\(${time}\\)`;

  if (classData.zoomLink) {
    message += `\n[Unirse a Zoom](${classData.zoomLink})`;
  }

  await sendMessage(bot, message);
  logger.info({ class: classData.title }, 'Class reminder sent');
}

export async function sendDeadlineReminder(
  bot: Telegraf,
  activity: ActivityData,
  hoursLeft: number,
): Promise<void> {
  const message = formatDeadlineReminder(activity, hoursLeft);
  await sendMessage(bot, message);
  logger.info({ activity: activity.title, hoursLeft }, 'Deadline reminder sent');
}

export async function sendChangeNotifications(
  bot: Telegraf,
  changesData: Array<{
    changeType: string;
    entityType: string;
    newValue?: string | null;
    oldValue?: string | null;
  }>,
): Promise<void> {
  if (changesData.length === 0) return;

  // Telegram message limit is 4096 characters; we use 3800 as safe threshold
  const MAX_LENGTH = 3800;
  const header = '*Cambios detectados:*';

  const formattedLines: string[] = [];
  for (const change of changesData) {
    formattedLines.push(
      formatChangeNotification({
        changeType: change.changeType,
        entityType: change.entityType,
        newValue: change.newValue || undefined,
        oldValue: change.oldValue || undefined,
      }),
    );
  }

  // Split into chunks that fit within Telegram's limit
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentLength = header.length + 2; // header + two newlines

  for (const line of formattedLines) {
    const lineLength = line.length + 1; // +1 for the newline separator
    if (currentLength + lineLength > MAX_LENGTH && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = header.length + 2;
    }
    currentChunk.push(line);
    currentLength += lineLength;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks.length > 1 ? ` \\(${i + 1}/${chunks.length}\\)` : '';
    const message = [`${header}${part}`, '', ...chunks[i]].join('\n');
    await sendMessage(bot, message);
  }

  logger.info({ count: changesData.length, messages: chunks.length }, 'Change notifications sent');
}
