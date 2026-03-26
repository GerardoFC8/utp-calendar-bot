import { Telegraf } from 'telegraf';
import { logger } from '../logger.js';
import { getDayName } from '../scraper/parser.js';
import type { ClassData, TaskData, CourseData } from '../scraper/parser.js';
import {
  getAllClasses,
  getClassesByDay,
  getPendingTasks,
  getAllCourses,
  getScrapeStats,
  getLastScrapeLog,
} from '../db/queries.js';
import {
  formatDailySchedule,
  formatWeeklySchedule,
  formatCoursesList,
  formatTaskItem,
  formatZoomLinks,
  formatStatusMessage,
  formatRefreshResult,
} from './formatters.js';
// sendMessage is available for external callers if needed
export { sendMessage } from './notifications.js';

const startTime = Date.now();

type RefreshCallback = () => Promise<{
  coursesFound: number;
  classesFound: number;
  tasksFound: number;
  changesDetected: number;
  duration: number;
}>;

let refreshCallback: RefreshCallback | null = null;

export function setRefreshCallback(cb: RefreshCallback): void {
  refreshCallback = cb;
}

export function registerCommands(bot: Telegraf): void {
  bot.command('start', async (ctx) => {
    const message = [
      '*UTP\\+ Calendar Bot*',
      '',
      'Bot de notificaciones para tu calendario de UTP\\+ Class\\.',
      '',
      '*Comandos disponibles:*',
      '/hoy \\- Clases y tareas de hoy',
      '/manana \\- Clases y tareas de manana',
      '/semana \\- Horario semanal',
      '/cursos \\- Lista de cursos activos',
      '/tareas \\- Tareas pendientes',
      '/zoom \\- Links de Zoom activos',
      '/refresh \\- Ejecutar scrape inmediato',
      '/status \\- Estado del bot',
      '/help \\- Lista de comandos',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('hoy', async (ctx) => {
    const today = new Date();
    const dayName = getDayName(today);
    const classes = getClassesByDay(dayName) as ClassData[];
    const tasks = getPendingTasks() as TaskData[];

    const todayStr = today.toISOString().split('T')[0];
    const relevantTasks = tasks.filter((t) => t.dueDate <= todayStr || daysUntil(t.dueDate) <= 3);

    const message = formatDailySchedule(today, classes, relevantTasks);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('manana', async (ctx) => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const dayName = getDayName(tomorrow);
    const classes = getClassesByDay(dayName) as ClassData[];
    const tasks = getPendingTasks() as TaskData[];

    const relevantTasks = tasks.filter((t) => {
      const d = daysUntil(t.dueDate);
      return d >= 0 && d <= 3;
    });

    const message = formatDailySchedule(tomorrow, classes, relevantTasks);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('semana', async (ctx) => {
    const allClasses = getAllClasses() as ClassData[];
    const classesByDay = new Map<string, ClassData[]>();

    for (const cls of allClasses) {
      const existing = classesByDay.get(cls.day) || [];
      existing.push(cls);
      classesByDay.set(cls.day, existing);
    }

    const message = formatWeeklySchedule(classesByDay);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('cursos', async (ctx) => {
    const courses = getAllCourses() as CourseData[];
    const message = formatCoursesList(courses);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('tareas', async (ctx) => {
    const tasks = getPendingTasks() as TaskData[];

    if (tasks.length === 0) {
      await ctx.reply('_No hay tareas pendientes_', { parse_mode: 'MarkdownV2' });
      return;
    }

    const sorted = tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const lines: string[] = ['*Tareas pendientes:*', ''];

    for (const task of sorted) {
      lines.push(formatTaskItem(task));
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
  });

  bot.command('zoom', async (ctx) => {
    const classes = getAllClasses() as ClassData[];
    const courses = getAllCourses() as CourseData[];
    const message = formatZoomLinks(classes, courses);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('refresh', async (ctx) => {
    if (!refreshCallback) {
      await ctx.reply('Scrape no disponible');
      return;
    }

    await ctx.reply('Ejecutando scrape\\.\\.\\. Esto puede tardar unos minutos\\.', {
      parse_mode: 'MarkdownV2',
    });

    try {
      const result = await refreshCallback();
      const message = formatRefreshResult(result);
      await ctx.reply(message, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      logger.error({ error }, 'Refresh command failed');
      await ctx.reply('Error al ejecutar el scrape\\. Revisa los logs\\.', {
        parse_mode: 'MarkdownV2',
      });
    }
  });

  bot.command('status', async (ctx) => {
    const stats = getScrapeStats();
    const lastScrape = getLastScrapeLog();

    const message = formatStatusMessage({
      totalCourses: stats.totalCourses,
      totalClasses: stats.totalClasses,
      totalTasks: stats.totalTasks,
      pendingTasks: stats.pendingTasks,
      lastScrape: lastScrape
        ? {
            status: lastScrape.status,
            createdAt: lastScrape.createdAt,
            duration: lastScrape.duration,
          }
        : undefined,
      uptime: Date.now() - startTime,
    });

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('help', async (ctx) => {
    const message = [
      '*Comandos disponibles:*',
      '',
      '/hoy \\- Clases y tareas de hoy',
      '/manana \\- Clases y tareas de manana',
      '/semana \\- Horario semanal completo',
      '/cursos \\- Lista de cursos activos del semestre',
      '/tareas \\- Todas las tareas pendientes con urgencia',
      '/zoom \\- Links de Zoom activos',
      '/refresh \\- Ejecutar scrape inmediato',
      '/status \\- Estado del bot y ultimo scrape',
      '/help \\- Esta lista de comandos',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  logger.info('Bot commands registered');
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}
