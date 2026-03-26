import type { ClassData, ActivityData, CourseData } from '../scraper/parser.js';

// MarkdownV2 requires escaping these characters
const SPECIAL_CHARS = /[_*[\]()~`>#+\-=|{}.!]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(SPECIAL_CHARS, '\\$&');
}

// ============================================================
// Date/time helpers
// ============================================================

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

// Format datetime string "2026-03-28 18:30:00" to "18:30"
function formatTimeFromDatetime(datetime: string): string {
  const parts = datetime.split(' ');
  if (parts.length >= 2) {
    const timeParts = (parts[1] ?? '').split(':');
    return `${timeParts[0] ?? '00'}:${timeParts[1] ?? '00'}`;
  }
  return datetime;
}

// Format datetime to "28/03 a las 6:30 PM"
function formatDeadline(datetime: string): string {
  const parts = datetime.split(' ');
  const datePart = parts[0] ?? '';
  const timePart = parts[1] ?? '';

  const dateSegments = datePart.split('-');
  const day = dateSegments[2] ?? '??';
  const month = dateSegments[1] ?? '??';

  const timeSegments = timePart.split(':');
  let hours = parseInt(timeSegments[0] ?? '0', 10);
  const minutes = timeSegments[1] ?? '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;

  return `${day}/${month} a las ${hours}:${minutes} ${period}`;
}

// How many days until a datetime string (positive = future, negative = past)
function daysUntilDatetime(datetime: string): number {
  const now = new Date();
  const target = new Date(datetime.replace(' ', 'T'));
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function formatDayHeader(date: Date): string {
  const dayName = getSpanishDayName(date);
  const day = date.getDate();
  const month = getSpanishMonthName(date);
  return `*${escapeMarkdown(dayName)} ${day} de ${escapeMarkdown(month)}*`;
}

// ============================================================
// Class formatters
// ============================================================

export function formatClassItem(classData: ClassData): string {
  const lines: string[] = [];
  const startTime = formatTimeFromDatetime(classData.startAt);
  const endTime = formatTimeFromDatetime(classData.finishAt);
  const time = escapeMarkdown(`${startTime} - ${endTime}`);
  const title = escapeMarkdown(classData.title);

  lines.push(`\\- *${time}* \\| ${title}`);

  if (classData.zoomLink) {
    lines.push(`  [Abrir Zoom](${classData.zoomLink})`);
  }

  return lines.join('\n');
}

export function formatDailySchedule(
  date: Date,
  classes: ClassData[],
  activities: ActivityData[],
  greeting?: string,
): string {
  const lines: string[] = [];

  if (greeting) {
    lines.push(escapeMarkdown(greeting));
    lines.push('');
  }

  lines.push(formatDayHeader(date));
  lines.push('');

  // Sort by startAt
  const sortedClasses = [...classes].sort((a, b) => a.startAt.localeCompare(b.startAt));

  if (sortedClasses.length > 0) {
    lines.push('*Clases de hoy:*');
    lines.push('');
    for (const cls of sortedClasses) {
      lines.push(formatClassItem(cls));
      lines.push('');
    }
  } else {
    lines.push('_No hay clases programadas_');
    lines.push('');
  }

  if (activities.length > 0) {
    lines.push('*Vence hoy:*');
    lines.push('');
    for (const activity of activities) {
      const time = formatTimeFromDatetime(activity.finishAt);
      const title = escapeMarkdown(activity.title);
      const course = escapeMarkdown(shortenCourseName(activity.courseName));
      lines.push(`\\- \\[${course}\\] ${title} \\(${escapeMarkdown(time)}\\)`);
    }
  }

  return lines.join('\n');
}

export function formatWeeklySchedule(
  classesByDate: Map<string, ClassData[]>,
): string {
  const lines: string[] = [];

  lines.push('*Horario de la semana*');
  lines.push('');

  // Sort by date
  const sortedDates = [...classesByDate.keys()].sort();

  for (const dateStr of sortedDates) {
    const dayClasses = classesByDate.get(dateStr);
    if (!dayClasses || dayClasses.length === 0) continue;

    // Parse "2026-03-28" -> "Sabado 28/03"
    const dateParts = dateStr.split('-');
    const day = dateParts[2] ?? '??';
    const month = dateParts[1] ?? '??';
    const dateObj = new Date(`${dateStr}T12:00:00`);
    const dayName = getSpanishDayName(dateObj);

    lines.push(`*${escapeMarkdown(dayName)} ${escapeMarkdown(day)}/${escapeMarkdown(month)}:*`);

    const sorted = [...dayClasses].sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (const cls of sorted) {
      lines.push(formatClassItem(cls));
    }
    lines.push('');
  }

  if (lines.length <= 2) {
    return '_No hay clases registradas esta semana_';
  }

  return lines.join('\n');
}

// ============================================================
// Course formatters
// ============================================================

export function formatCoursesList(courses: CourseData[]): string {
  if (courses.length === 0) return '_No hay cursos registrados_';

  const lines: string[] = [];
  lines.push('*Cursos activos:*');
  lines.push('');

  courses.forEach((course, index) => {
    const name = escapeMarkdown(course.name);
    const modalityLabel = course.modality === 'VT' ? 'Virtual 24/7' : 'Virtual en vivo';
    const teacher = [course.teacherFirstName, course.teacherLastName]
      .filter(Boolean)
      .map((n) => n.trim())
      .join(' ');

    lines.push(`${index + 1}\\. *${name}*`);
    lines.push(`   Codigo: ${escapeMarkdown(course.classNumber)} \\| ${escapeMarkdown(modalityLabel)}`);
    if (teacher) {
      lines.push(`   Prof\\. ${escapeMarkdown(teacher)}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

// ============================================================
// Activity formatters
// ============================================================

export function formatActivitiesList(activities: ActivityData[]): string {
  if (activities.length === 0) return '_No hay actividades pendientes_';

  const lines: string[] = [];
  lines.push('*Actividades pendientes:*');
  lines.push('');

  // Group by type
  const byType = new Map<string, ActivityData[]>();
  for (const activity of activities) {
    const type = activity.activityType;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(activity);
  }

  const typeLabels: Record<string, string> = {
    HOMEWORK: 'TAREAS',
    FORUM: 'FOROS',
    EVALUATION: 'EVALUACIONES',
  };

  // Order: HOMEWORK, FORUM, EVALUATION
  const typeOrder = ['HOMEWORK', 'FORUM', 'EVALUATION'];

  for (const type of typeOrder) {
    const typeActivities = byType.get(type);
    if (!typeActivities || typeActivities.length === 0) continue;

    const label = typeLabels[type] ?? type;
    lines.push(`*${escapeMarkdown(label)}:*`);

    for (const activity of typeActivities) {
      const course = escapeMarkdown(shortenCourseName(activity.courseName));
      const title = escapeMarkdown(activity.title);
      const deadline = escapeMarkdown(formatDeadline(activity.finishAt));
      const days = daysUntilDatetime(activity.finishAt);

      let urgency: string;
      if (days < 0) {
        urgency = 'VENCIDA';
      } else if (days === 0) {
        urgency = 'HOY\\!';
      } else if (days === 1) {
        urgency = 'manana';
      } else {
        urgency = `en ${days} dias`;
      }

      lines.push(`\\- \\[${course}\\] ${title}`);
      lines.push(`  Vence: ${deadline} \\(${escapeMarkdown(urgency)}\\)`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatActivityItem(activity: ActivityData): string {
  const days = daysUntilDatetime(activity.finishAt);
  const deadline = escapeMarkdown(formatDeadline(activity.finishAt));
  const title = escapeMarkdown(activity.title);
  const course = escapeMarkdown(shortenCourseName(activity.courseName));

  let icon: string;
  let urgency: string;

  if (days < 0) {
    icon = '\ud83d\udd34';
    urgency = `*Vencida* \\(${deadline}\\)`;
  } else if (days === 0) {
    icon = '\ud83d\udfe1';
    urgency = `*HOY* \\(${deadline}\\)`;
  } else if (days === 1) {
    icon = '\ud83d\udfe1';
    urgency = `*Manana* \\(${deadline}\\)`;
  } else {
    icon = '\ud83d\udfe2';
    urgency = `*${days} dias* \\(${deadline}\\)`;
  }

  return `${icon} \\[${course}\\] ${title} \\- ${urgency}`;
}

// ============================================================
// Zoom formatters
// ============================================================

export function formatZoomLinks(classes: ClassData[]): string {
  const lines: string[] = [];

  lines.push('*Links de Zoom:*');
  lines.push('');

  const classesWithZoom = classes.filter((c) => c.zoomLink);

  if (classesWithZoom.length === 0) {
    return '_No hay links de Zoom disponibles_';
  }

  for (const cls of classesWithZoom) {
    const startTime = formatTimeFromDatetime(cls.startAt);
    const dateParts = cls.startAt.split(' ')[0]?.split('-') ?? [];
    const day = dateParts[2] ?? '??';
    const month = dateParts[1] ?? '??';
    const title = escapeMarkdown(cls.title);

    lines.push(`\\- *${title}* \\(${escapeMarkdown(day)}/${escapeMarkdown(month)} ${escapeMarkdown(startTime)}\\)`);
    lines.push(`  [Abrir Zoom](${cls.zoomLink!})`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// Status and refresh formatters
// ============================================================

export function formatStatusMessage(stats: {
  totalCourses: number;
  totalClasses: number;
  totalActivities: number;
  pendingActivities: number;
  lastScrape?: { status: string; createdAt: number | null; duration: number | null };
  uptime: number;
}): string {
  const lines: string[] = [];

  lines.push('*Estado del bot:*');
  lines.push('');
  lines.push(`Cursos: ${stats.totalCourses}`);
  lines.push(`Clases: ${stats.totalClasses}`);
  lines.push(`Actividades: ${stats.totalActivities} \\(${stats.pendingActivities} pendientes\\)`);
  lines.push('');

  if (stats.lastScrape) {
    const status = stats.lastScrape.status === 'success' ? 'Exitoso' : 'Error';
    lines.push(`Ultimo scrape: ${escapeMarkdown(status)}`);
    if (stats.lastScrape.createdAt) {
      const ago = Math.floor((Date.now() - stats.lastScrape.createdAt) / 60_000);
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

export function formatRefreshResult(result: {
  coursesFound: number;
  classesFound: number;
  activitiesFound: number;
  changesDetected: number;
  duration: number;
}): string {
  const lines: string[] = [];

  lines.push('*Scrape completado:*');
  lines.push('');
  lines.push(`Cursos: ${result.coursesFound}`);
  lines.push(`Clases programadas: ${result.classesFound}`);
  lines.push(`Actividades: ${result.activitiesFound}`);
  lines.push(`Cambios detectados: ${result.changesDetected}`);
  lines.push(`Duracion: ${escapeMarkdown((result.duration / 1000).toFixed(1) + 's')}`);

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
    : change.oldValue
      ? JSON.parse(change.oldValue)
      : {};

  const name = escapeMarkdown(entity.title || entity.name || 'Desconocido');

  switch (change.changeType) {
    case 'added':
      if (change.entityType === 'activity') {
        return `Nueva actividad: *${name}* \\- Vence: ${escapeMarkdown(entity.finishAt || '?')}`;
      }
      return `Nueva clase agregada: *${name}*`;

    case 'removed':
      if (change.entityType === 'class') {
        return `Clase cancelada: *${name}*`;
      }
      return `Elemento eliminado: *${name}*`;

    case 'modified':
      return `Cambio en *${name}*`;

    default:
      return `Cambio detectado en *${name}*`;
  }
}

// ============================================================
// Helpers
// ============================================================

function shortenCourseName(name: string): string {
  // Truncate very long course names for display
  if (name.length <= 20) return name;
  return name.substring(0, 18) + '..';
}
