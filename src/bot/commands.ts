import { Telegraf } from 'telegraf';
import { logger } from '../logger.js';
import type { ClassData, ActivityData, CourseData } from '../scraper/parser.js';
import type { ClassRow, ActivityRow, CourseRow } from '../db/queries.js';
import {
  getAllClasses,
  getClassesForDate,
  getPendingActivities,
  getActivitiesDueSoon,
  getAllCourses,
  getScrapeStats,
  getLastScrapeLog,
} from '../db/queries.js';
import {
  formatDailySchedule,
  formatWeeklySchedule,
  formatCoursesList,
  formatActivitiesList,
  formatActivityItem,
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
  activitiesFound: number;
  changesDetected: number;
  duration: number;
}>;

let refreshCallback: RefreshCallback | null = null;

export function setRefreshCallback(cb: RefreshCallback): void {
  refreshCallback = cb;
}

// ============================================================
// Row mappers — SQLite integer booleans -> TypeScript booleans
// ============================================================

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

function mapCourseRow(row: CourseRow): CourseData {
  return {
    id: row.id,
    sectionId: row.sectionId ?? '',
    name: row.name,
    classNumber: row.classNumber ?? '',
    modality: row.modality ?? 'VT',
    acadCareer: row.acadCareer ?? 'PREG',
    period: row.period ?? '',
    teacherFirstName: row.teacherFirstName ?? '',
    teacherLastName: row.teacherLastName ?? '',
    teacherEmail: row.teacherEmail ?? '',
    progress: row.progress ?? 0,
  };
}

// ============================================================
// Helpers
// ============================================================

function getTodayStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ============================================================
// Command registration
// ============================================================

export function registerCommands(bot: Telegraf): void {
  bot.command('start', async (ctx) => {
    const message = [
      '*UTP\\+ Calendar Bot*',
      '',
      'Bot de notificaciones para tu calendario de UTP\\+ Class\\.',
      '',
      '*Comandos disponibles:*',
      '/hoy \\- Clases y actividades de hoy',
      '/manana \\- Clases y actividades de manana',
      '/semana \\- Horario semanal',
      '/cursos \\- Lista de cursos activos',
      '/actividades \\- Actividades pendientes',
      '/pendientes \\- Actividades urgentes \\(proximos 3 dias\\)',
      '/zoom \\- Links de Zoom',
      '/refresh \\- Ejecutar scrape inmediato',
      '/status \\- Estado del bot',
      '/help \\- Lista de comandos',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('hoy', async (ctx) => {
    const today = new Date();
    const todayStr = getTodayStr();

    const classes = getClassesForDate(todayStr).map(mapClassRow);
    const activities = getPendingActivities()
      .map(mapActivityRow)
      .filter((a) => {
        const activityDate = a.finishAt.split(' ')[0] ?? '';
        return activityDate === todayStr;
      });

    const message = formatDailySchedule(today, classes, activities);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('manana', async (ctx) => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

    const classes = getClassesForDate(tomorrowStr).map(mapClassRow);
    const activities = getPendingActivities()
      .map(mapActivityRow)
      .filter((a) => {
        const activityDate = a.finishAt.split(' ')[0] ?? '';
        return activityDate === tomorrowStr;
      });

    const message = formatDailySchedule(tomorrow, classes, activities);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('semana', async (ctx) => {
    const allClasses = getAllClasses().map(mapClassRow);
    const classesByDate = new Map<string, ClassData[]>();

    for (const cls of allClasses) {
      // Extract "2026-03-28" from "2026-03-28 18:30:00"
      const dateStr = cls.startAt.split(' ')[0] ?? cls.startAt;
      const existing = classesByDate.get(dateStr) ?? [];
      existing.push(cls);
      classesByDate.set(dateStr, existing);
    }

    const message = formatWeeklySchedule(classesByDate);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('cursos', async (ctx) => {
    const courses = getAllCourses().map(mapCourseRow);
    const message = formatCoursesList(courses);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('actividades', async (ctx) => {
    const activities = getPendingActivities().map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply('_No hay actividades pendientes_', { parse_mode: 'MarkdownV2' });
      return;
    }

    const message = formatActivitiesList(activities);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  // Alias for backwards compatibility
  bot.command('tareas', async (ctx) => {
    const activities = getPendingActivities().map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply('_No hay actividades pendientes_', { parse_mode: 'MarkdownV2' });
      return;
    }

    const message = formatActivitiesList(activities);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('pendientes', async (ctx) => {
    const activities = getActivitiesDueSoon(3).map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply('_No hay actividades urgentes en los proximos 3 dias_', {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    const lines: string[] = ['*Actividades urgentes \\(proximos 3 dias\\):*', ''];
    for (const activity of activities) {
      lines.push(formatActivityItem(activity));
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
  });

  bot.command('zoom', async (ctx) => {
    const classes = getAllClasses().map(mapClassRow);
    const message = formatZoomLinks(classes);
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
      totalActivities: stats.totalActivities,
      pendingActivities: stats.pendingActivities,
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
      '/hoy \\- Clases y actividades de hoy',
      '/manana \\- Clases y actividades de manana',
      '/semana \\- Horario semanal completo',
      '/cursos \\- Lista de cursos activos del semestre',
      '/actividades \\- Todas las actividades pendientes',
      '/pendientes \\- Actividades urgentes \\(proximos 3 dias\\)',
      '/zoom \\- Links de Zoom de clases proximas',
      '/refresh \\- Ejecutar scrape inmediato',
      '/status \\- Estado del bot y ultimo scrape',
      '/help \\- Esta lista de comandos',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  logger.info('Bot commands registered');
}
