import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getClassesByDay, getPendingTasks } from '../db/queries.js';
import { getDayName } from '../scraper/parser.js';
import {
  formatDailySchedule,
  formatChangeNotification,
  escapeMarkdown,
} from './formatters.js';
import type { ClassData, TaskData } from '../scraper/parser.js';

export async function sendMessage(bot: Telegraf, text: string, parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2'): Promise<void> {
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
        const plainText = text.replace(/[\\*_`\[\]()~>#+\-=|{}.!]/g, '');
        await bot.telegram.sendMessage(config.TELEGRAM_CHAT_ID, plainText);
      } catch (retryError) {
        logger.error({ retryError }, 'Failed to send plain text message too');
      }
    }
  }
}

export async function sendMorningReminder(bot: Telegraf): Promise<void> {
  const today = new Date();
  const dayName = getDayName(today);

  const classes = getClassesByDay(dayName) as ClassData[];
  const allTasks = getPendingTasks() as TaskData[];

  // Filter tasks relevant for today
  const todayStr = today.toISOString().split('T')[0];
  const relevantTasks = allTasks.filter((t) => {
    return t.dueDate <= todayStr || daysUntilDate(t.dueDate) <= 3;
  });

  if (classes.length === 0 && relevantTasks.length === 0) {
    logger.info('No classes or tasks today, skipping morning reminder');
    return;
  }

  const message = formatDailySchedule(
    today,
    classes,
    relevantTasks,
    'Buenos dias'
  );

  await sendMessage(bot, message);
  logger.info('Morning reminder sent');
}

export async function sendClassReminder(bot: Telegraf, classData: ClassData): Promise<void> {
  const name = escapeMarkdown(classData.name);
  const time = escapeMarkdown(classData.startTime);

  let message = `En ${config.CLASS_REMINDER_MINUTES} minutos: *${name}* \\(${time}\\)`;

  if (classData.zoomLink) {
    message += `\n[Unirse a Zoom](${escapeMarkdown(classData.zoomLink)})`;
  }

  await sendMessage(bot, message);
  logger.info({ class: classData.name }, 'Class reminder sent');
}

export async function sendChangeNotifications(
  bot: Telegraf,
  changesData: Array<{
    changeType: string;
    entityType: string;
    newValue?: string | null;
    oldValue?: string | null;
  }>
): Promise<void> {
  if (changesData.length === 0) return;

  const lines: string[] = ['*Cambios detectados:*', ''];

  for (const change of changesData) {
    const notification = formatChangeNotification({
      changeType: change.changeType,
      entityType: change.entityType,
      newValue: change.newValue || undefined,
      oldValue: change.oldValue || undefined,
    });
    lines.push(notification);
  }

  await sendMessage(bot, lines.join('\n'));
  logger.info({ count: changesData.length }, 'Change notifications sent');
}

function daysUntilDate(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}
