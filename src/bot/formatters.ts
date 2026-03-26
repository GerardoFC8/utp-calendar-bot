import type { ClassData, TaskData, CourseData } from '../scraper/parser.js';

// MarkdownV2 requires escaping these characters
const SPECIAL_CHARS = /[_*[\]()~`>#+\-=|{}.!]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(SPECIAL_CHARS, '\\$&');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
  });
}

function getSpanishDayName(date: Date): string {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return days[date.getDay()];
}

function getSpanishMonthName(date: Date): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return months[date.getMonth()];
}

function daysUntil(dueDate: string): number {
  const now = new Date();
  const target = new Date(dueDate + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function formatDayHeader(date: Date): string {
  const dayName = getSpanishDayName(date);
  const day = date.getDate();
  const month = getSpanishMonthName(date);
  return `*${escapeMarkdown(dayName)} ${day} de ${escapeMarkdown(month)}*`;
}

export function formatClassItem(classData: ClassData): string {
  const lines: string[] = [];
  const time = escapeMarkdown(`${classData.startTime} - ${classData.endTime}`);
  const name = escapeMarkdown(classData.name);

  lines.push(`*${time}* \\- ${name}`);

  const details: string[] = [];
  if (classData.professor) {
    details.push(`Prof\\. ${escapeMarkdown(classData.professor)}`);
  }
  if (classData.room) {
    details.push(`Aula ${escapeMarkdown(classData.room)}`);
  }
  if (details.length > 0) {
    lines.push(`   ${details.join(' \\| ')}`);
  }

  if (classData.zoomLink) {
    lines.push(`   [Abrir Zoom](${escapeMarkdown(classData.zoomLink)})`);
  }

  return lines.join('\n');
}

export function formatTaskItem(task: TaskData): string {
  const days = daysUntil(task.dueDate);
  const date = formatDate(task.dueDate);
  const name = escapeMarkdown(task.name);

  let icon: string;
  let urgency: string;

  if (days < 0) {
    icon = '\ud83d\udd34';
    urgency = `*Vencida* \\(${escapeMarkdown(date)}\\)`;
  } else if (days === 0) {
    icon = '\ud83d\udfe1';
    urgency = `*Hoy* \\(${escapeMarkdown(date)}\\)`;
  } else if (days === 1) {
    icon = '\ud83d\udfe1';
    urgency = `*Manana* \\(${escapeMarkdown(date)}\\)`;
  } else {
    icon = '\ud83d\udfe2';
    urgency = `*${days} dias* \\(${escapeMarkdown(date)}\\)`;
  }

  let line = `${icon} ${name} \\- ${urgency}`;
  if (task.subject) {
    line += ` \\- ${escapeMarkdown(task.subject)}`;
  }

  return line;
}

export function formatDailySchedule(
  date: Date,
  classes: ClassData[],
  tasks: TaskData[],
  greeting?: string
): string {
  const lines: string[] = [];

  if (greeting) {
    lines.push(greeting);
    lines.push('');
  }

  lines.push(formatDayHeader(date));
  lines.push('');

  if (classes.length > 0) {
    lines.push('*Clases de hoy:*');
    lines.push('');
    for (const cls of classes.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      lines.push(formatClassItem(cls));
      lines.push('');
    }
  } else {
    lines.push('_No hay clases programadas_');
    lines.push('');
  }

  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  if (pendingTasks.length > 0) {
    lines.push('*Tareas pendientes:*');
    lines.push('');
    for (const task of pendingTasks) {
      lines.push(formatTaskItem(task));
    }
  }

  return lines.join('\n');
}

export function formatWeeklySchedule(
  classesByDay: Map<string, ClassData[]>
): string {
  const lines: string[] = [];
  const dayOrder = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  lines.push('*Horario semanal*');
  lines.push('');

  for (const day of dayOrder) {
    const dayClasses = classesByDay.get(day);
    if (!dayClasses || dayClasses.length === 0) continue;

    lines.push(`*${escapeMarkdown(day)}:*`);
    for (const cls of dayClasses.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      lines.push(formatClassItem(cls));
    }
    lines.push('');
  }

  if (lines.length <= 2) {
    return '_No hay clases registradas esta semana_';
  }

  return lines.join('\n');
}

export function formatCoursesList(courses: CourseData[]): string {
  const lines: string[] = [];

  lines.push('*Cursos activos:*');
  lines.push('');

  for (const course of courses) {
    const name = escapeMarkdown(course.name);
    const details: string[] = [];

    if (course.code) details.push(escapeMarkdown(course.code));
    if (course.section) details.push(`Sec\\. ${escapeMarkdown(course.section)}`);
    if (course.professor) details.push(`Prof\\. ${escapeMarkdown(course.professor)}`);

    lines.push(`\\- *${name}*`);
    if (details.length > 0) {
      lines.push(`  ${details.join(' \\| ')}`);
    }
  }

  if (courses.length === 0) {
    return '_No hay cursos registrados_';
  }

  return lines.join('\n');
}

export function formatZoomLinks(
  classes: ClassData[],
  courses: CourseData[]
): string {
  const lines: string[] = [];

  lines.push('*Links de Zoom activos:*');
  lines.push('');

  const classesWithZoom = classes.filter((c) => c.zoomLink);
  const coursesWithZoom = courses.filter((c) => c.zoomLink);

  if (classesWithZoom.length > 0) {
    lines.push('*Clases:*');
    for (const cls of classesWithZoom) {
      lines.push(`\\- ${escapeMarkdown(cls.name)}: [Abrir Zoom](${escapeMarkdown(cls.zoomLink!)})`);
    }
    lines.push('');
  }

  if (coursesWithZoom.length > 0) {
    lines.push('*Cursos:*');
    for (const course of coursesWithZoom) {
      lines.push(`\\- ${escapeMarkdown(course.name)}: [Abrir Zoom](${escapeMarkdown(course.zoomLink!)})`);
    }
  }

  if (classesWithZoom.length === 0 && coursesWithZoom.length === 0) {
    return '_No hay links de Zoom disponibles_';
  }

  return lines.join('\n');
}

export function formatStatusMessage(stats: {
  totalCourses: number;
  totalClasses: number;
  totalTasks: number;
  pendingTasks: number;
  lastScrape?: { status: string; createdAt: Date | null; duration: number | null };
  uptime: number;
}): string {
  const lines: string[] = [];

  lines.push('*Estado del bot:*');
  lines.push('');
  lines.push(`Cursos: ${stats.totalCourses}`);
  lines.push(`Clases: ${stats.totalClasses}`);
  lines.push(`Tareas: ${stats.totalTasks} \\(${stats.pendingTasks} pendientes\\)`);
  lines.push('');

  if (stats.lastScrape) {
    const status = stats.lastScrape.status === 'success' ? 'Exitoso' : 'Error';
    lines.push(`Ultimo scrape: ${escapeMarkdown(status)}`);
    if (stats.lastScrape.createdAt) {
      const ago = Math.floor((Date.now() - stats.lastScrape.createdAt.getTime()) / 60_000);
      lines.push(`Hace: ${ago} minutos`);
    }
    if (stats.lastScrape.duration) {
      lines.push(`Duracion: ${escapeMarkdown((stats.lastScrape.duration / 1000).toFixed(1) + 's')}`);
    }
  } else {
    lines.push('_No se ha ejecutado ningun scrape_');
  }

  const uptimeMin = Math.floor(stats.uptime / 60_000);
  const uptimeHrs = Math.floor(uptimeMin / 60);
  lines.push(`Uptime: ${uptimeHrs}h ${uptimeMin % 60}m`);

  return lines.join('\n');
}

export function formatChangeNotification(change: {
  changeType: string;
  entityType: string;
  newValue?: string;
  oldValue?: string;
}): string {
  const entity = change.newValue
    ? JSON.parse(change.newValue)
    : (change.oldValue ? JSON.parse(change.oldValue) : {});
  const name = escapeMarkdown(entity.name || 'Desconocido');

  switch (change.changeType) {
    case 'added':
      if (change.entityType === 'task') {
        return `Nueva tarea detectada: *${name}* \\- Fecha limite: ${escapeMarkdown(entity.dueDate || '?')}`;
      }
      return `Nueva clase agregada: *${name}*`;

    case 'removed':
      if (change.entityType === 'class') {
        return `Clase cancelada: *${name}* del ${escapeMarkdown(entity.day || '?')}`;
      }
      return `Elemento eliminado: *${name}*`;

    case 'modified':
      return `Cambio en *${name}*`;

    default:
      return `Cambio detectado en *${name}*`;
  }
}

export function formatRefreshResult(result: {
  coursesFound: number;
  classesFound: number;
  tasksFound: number;
  changesDetected: number;
  duration: number;
}): string {
  const lines: string[] = [];

  lines.push('*Resultado del scrape:*');
  lines.push('');
  lines.push(`Cursos: ${result.coursesFound}`);
  lines.push(`Clases: ${result.classesFound}`);
  lines.push(`Tareas: ${result.tasksFound}`);
  lines.push(`Cambios detectados: ${result.changesDetected}`);
  lines.push(`Duracion: ${escapeMarkdown((result.duration / 1000).toFixed(1) + 's')}`);

  return lines.join('\n');
}
