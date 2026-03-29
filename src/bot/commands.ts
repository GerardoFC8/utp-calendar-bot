import { Telegraf } from 'telegraf';
import { logger } from '../logger.js';
import type { ClassData, ActivityData, CourseData } from '../scraper/parser.js';
import type { ClassRow, ActivityRow, CourseRow } from '../db/queries.js';
import {
  getAllClasses,
  getClassesForDate,
  getPendingActivities,
  getActivitiesDueSoon,
  getActivitiesForMonth,
  getAllCourses,
  getScrapeStats,
  getLastScrapeLog,
  setSetting,
  getAllSettings,
  getCurrentAcademicWeek,
} from '../db/queries.js';
import {
  escapeMarkdown,
  formatDailySchedule,
  formatWeeklySchedule,
  formatCoursesList,
  formatActivitiesList,
  formatActivityItem,
  formatZoomLinks,
  formatStatusMessage,
  formatRefreshResult,
  formatReporteTxt,
  formatResumen,
  formatConfigMenu,
  splitMessage,
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
  progressChanges?: Array<{ courseName: string; oldProgress: number; newProgress: number }>;
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
    currentWeek: row.currentWeek ?? undefined,
    totalWeeks: row.totalWeeks ?? undefined,
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
// Month helpers
// ============================================================

const MONTH_NAMES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const MONTH_LABELS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function parseMonthArg(arg: string, now: Date): { year: number; month: number } {
  const offset = parseInt(arg, 10);
  if (!isNaN(offset)) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  const m = MONTH_NAMES[arg.toLowerCase().trim()];
  if (m !== undefined) {
    const year = m < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    return { year, month: m };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ============================================================
// Progress bar helper
// ============================================================

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return escapeMarkdown('[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']');
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
      '/semana \\[\\+N\\] \\- Horario semanal \\(\\+1 \\= proxima semana\\)',
      '/resumen \\- Dashboard compacto del dia',
      '/cursos \\- Lista de cursos activos',
      '/progreso \\- Progreso por curso',
      '/actividades \\[mes\\] \\- Actividades del mes \\(ej\\: abril, 1\\)',
      '/pendientes \\- Actividades urgentes \\(proximos 3 dias\\)',
      '/reporte \\- Exportar actividades completas como archivo TXT',
      '/zoom \\- Links de Zoom',
      '/refresh \\- Ejecutar scrape inmediato',
      '/config \\- Ver o cambiar configuracion',
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

    const weekInfo = getCurrentAcademicWeek();
    const message = formatDailySchedule(today, classes, activities, undefined, weekInfo);
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
    const args = (ctx.message?.text ?? '').split(' ').slice(1);
    const offsetArg = args[0] ?? '0';
    const weekOffset = parseInt(offsetArg.replace('+', ''), 10);
    const offset = isNaN(weekOffset) ? 0 : weekOffset;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    // Compute Monday of target week
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now.getTime() + (daysToMonday + offset * 7) * 86_400_000);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);

    const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const sundayStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

    const allClasses = getAllClasses().map(mapClassRow);
    const classesByDate = new Map<string, ClassData[]>();

    for (const cls of allClasses) {
      const dateStr = cls.startAt.split(' ')[0] ?? cls.startAt;
      if (dateStr < mondayStr || dateStr > sundayStr) continue;
      const existing = classesByDate.get(dateStr) ?? [];
      existing.push(cls);
      classesByDate.set(dateStr, existing);
    }

    // Build week label
    const mondayLabel = `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)}`;
    const sundayLabel = `${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}`;
    const weekLabel = offset === 0
      ? `*Semana actual \\(${escapeMarkdown(mondayLabel)} \\- ${escapeMarkdown(sundayLabel)}\\):*`
      : offset > 0
        ? `*Semana \\+${offset} \\(${escapeMarkdown(mondayLabel)} \\- ${escapeMarkdown(sundayLabel)}\\):*`
        : `*Semana ${offset} \\(${escapeMarkdown(mondayLabel)} \\- ${escapeMarkdown(sundayLabel)}\\):*`;

    const message = formatWeeklySchedule(classesByDate, weekLabel);
    for (const chunk of splitMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
  });

  bot.command('resumen', async (ctx) => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const todayClasses = getClassesForDate(todayStr).map(mapClassRow);
    const allPendingRows = getPendingActivities();
    const dueTodayActivities = allPendingRows
      .map(mapActivityRow)
      .filter(a => a.finishAt.startsWith(todayStr));
    const dueSoonActivities = getActivitiesDueSoon(7).map(mapActivityRow);
    const nextDeadline = allPendingRows.length > 0 ? mapActivityRow(allPendingRows[0]!) : null;

    // Week classes: classes from today through 6 days ahead
    const weekEnd = new Date(today.getTime() + 6 * 86_400_000);
    const weekEndStr = `${weekEnd.getFullYear()}-${pad(weekEnd.getMonth() + 1)}-${pad(weekEnd.getDate())}`;
    const allClasses = getAllClasses().map(mapClassRow);
    const weekClasses = allClasses.filter(
      c => c.startAt >= `${todayStr} 00:00:00` && c.startAt <= `${weekEndStr} 23:59:59`,
    );

    const weekInfo = getCurrentAcademicWeek();
    const message = formatResumen({
      todayClasses,
      weekClasses,
      dueTodayActivities,
      dueSoonActivities,
      pendingCount: allPendingRows.length,
      nextDeadline,
      today,
      weekInfo,
    });

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('cursos', async (ctx) => {
    const courses = getAllCourses().map(mapCourseRow);
    const message = formatCoursesList(courses);
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  bot.command('progreso', async (ctx) => {
    const courses = getAllCourses().map(mapCourseRow);

    if (courses.length === 0) {
      await ctx.reply('_No hay cursos registrados_', { parse_mode: 'MarkdownV2' });
      return;
    }

    const lines: string[] = [];
    lines.push('*Progreso por curso:*');
    lines.push('');

    for (const course of courses) {
      const name = escapeMarkdown(course.name);
      const pct = course.progress;
      const bar = buildProgressBar(pct);
      lines.push(`*${name}*`);
      lines.push(`${bar} ${escapeMarkdown(pct.toFixed(1) + '%')}`);
      lines.push('');
    }

    const message = lines.join('\n');
    for (const chunk of splitMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
  });

  bot.command('actividades', async (ctx) => {
    const now = new Date();
    const text = ctx.message?.text ?? '';
    const arg = text.split(' ')[1];
    const { year, month } = arg
      ? parseMonthArg(arg, now)
      : { year: now.getFullYear(), month: now.getMonth() + 1 };

    const activities = getActivitiesForMonth(year, month).map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply(
        `_No hay actividades pendientes para ${MONTH_LABELS[month]} ${year}_`,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const header = `*Actividades \\- ${escapeMarkdown(MONTH_LABELS[month]!)} ${year}:*`;
    const message = formatActivitiesList(activities, header);
    for (const chunk of splitMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
  });

  // Alias for backwards compatibility
  bot.command('tareas', async (ctx) => {
    const now = new Date();
    const text = ctx.message?.text ?? '';
    const arg = text.split(' ')[1];
    const { year, month } = arg
      ? parseMonthArg(arg, now)
      : { year: now.getFullYear(), month: now.getMonth() + 1 };

    const activities = getActivitiesForMonth(year, month).map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply(
        `_No hay actividades pendientes para ${MONTH_LABELS[month]} ${year}_`,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const header = `*Actividades \\- ${escapeMarkdown(MONTH_LABELS[month]!)} ${year}:*`;
    const message = formatActivitiesList(activities, header);
    for (const chunk of splitMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
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

  bot.command('reporte', async (ctx) => {
    const activities = getPendingActivities().map(mapActivityRow);

    if (activities.length === 0) {
      await ctx.reply('_No hay actividades pendientes_', { parse_mode: 'MarkdownV2' });
      return;
    }

    const now = new Date();
    const content = formatReporteTxt(activities, now);
    const buffer = Buffer.from(content, 'utf-8');

    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `reporte-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;

    await ctx.replyWithDocument(
      { source: buffer, filename },
      { caption: `Reporte con ${activities.length} actividades pendientes` },
    );
  });

  bot.command('config', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(' ').slice(1);

    const VALID_KEYS = new Set([
      'reminder_class_minutes',
      'reminder_deadline_24h',
      'reminder_deadline_2h',
      'morning_hour',
    ]);

    if (parts.length === 0) {
      // Show current settings
      const settings = getAllSettings();
      const message = formatConfigMenu(settings);
      await ctx.reply(message, { parse_mode: 'MarkdownV2' });
      return;
    }

    if (parts.length < 2) {
      await ctx.reply(
        'Uso: /config \\<clave\\> \\<valor\\>\nEjemplo: /config morning\\_hour 7',
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const key = parts[0]!;
    const value = parts[1]!;

    if (!VALID_KEYS.has(key)) {
      const validList = [...VALID_KEYS].map(k => escapeMarkdown(k)).join(', ');
      await ctx.reply(
        `Clave invalida\\. Claves validas: ${validList}`,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    // Validate value per key
    if (key === 'reminder_class_minutes' || key === 'morning_hour') {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) {
        await ctx.reply('El valor debe ser un numero positivo\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      if (key === 'morning_hour' && (num < 0 || num > 23)) {
        await ctx.reply('La hora debe estar entre 0 y 23\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
    }

    if (key === 'reminder_deadline_24h' || key === 'reminder_deadline_2h') {
      if (value !== 'true' && value !== 'false') {
        await ctx.reply('El valor debe ser `true` o `false`\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
    }

    setSetting(key, value);
    logger.info({ key, value }, 'Bot setting updated via /config');

    await ctx.reply(
      `Configuracion actualizada: ${escapeMarkdown(key)} \\= ${escapeMarkdown(value)}`,
      { parse_mode: 'MarkdownV2' },
    );
  });

  bot.command('help', async (ctx) => {
    const message = [
      '*Comandos disponibles:*',
      '',
      '/hoy \\- Clases y actividades de hoy',
      '/manana \\- Clases y actividades de manana',
      '/semana \\[\\+N\\] \\- Horario semanal \\(\\+1 \\= proxima semana\\)',
      '/resumen \\- Dashboard compacto del dia',
      '/cursos \\- Lista de cursos activos del semestre',
      '/progreso \\- Progreso por curso',
      '/actividades \\[mes\\] \\- Actividades del mes \\(ej\\: abril, 1\\)',
      '/pendientes \\- Actividades urgentes \\(proximos 3 dias\\)',
      '/reporte \\- Exportar actividades completas como archivo TXT',
      '/zoom \\- Links de Zoom de clases proximas',
      '/refresh \\- Ejecutar scrape inmediato',
      '/config \\- Ver o cambiar configuracion del bot',
      '/status \\- Estado del bot y ultimo scrape',
      '/help \\- Esta lista de comandos',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  logger.info('Bot commands registered');
}
