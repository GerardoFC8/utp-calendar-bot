import type { ActivityData } from './parser.js';

// This module aggregates and categorizes activities (formerly "tasks")

export function deduplicateActivities(activities: ActivityData[]): ActivityData[] {
  const seen = new Map<string, ActivityData>();

  for (const activity of activities) {
    const existing = seen.get(activity.id);
    if (!existing) {
      seen.set(activity.id, activity);
    } else {
      // Merge: prefer the pending activities endpoint data (more complete)
      // Keep the one with more info — isQualificated from pending endpoint is more accurate
      seen.set(activity.id, {
        ...existing,
        ...activity,
        // Preserve evaluationSystem if one has it
        evaluationSystem: activity.evaluationSystem || existing.evaluationSystem,
      });
    }
  }

  return Array.from(seen.values());
}

export function categorizeActivities(activities: ActivityData[]): {
  overdue: ActivityData[];
  today: ActivityData[];
  upcoming: ActivityData[];
} {
  const now = new Date();
  // Normalize to "YYYY-MM-DD HH:MM:SS" format for comparison
  const nowStr = formatDatetime(now);
  const todayDateStr = formatDate(now);

  const overdue: ActivityData[] = [];
  const today: ActivityData[] = [];
  const upcoming: ActivityData[] = [];

  for (const activity of activities) {
    // Skip activities that are not pending
    const pendingStatuses = ['PENDING', 'IN_PROCESS', 'PROGRAMMED'];
    if (!pendingStatuses.includes(activity.studentStatus)) continue;

    const finishDateStr = activity.finishAt.split(' ')[0] ?? activity.finishAt;

    if (activity.finishAt < nowStr) {
      overdue.push(activity);
    } else if (finishDateStr === todayDateStr) {
      today.push(activity);
    } else {
      upcoming.push(activity);
    }
  }

  // Sort by deadline
  overdue.sort((a, b) => a.finishAt.localeCompare(b.finishAt));
  today.sort((a, b) => a.finishAt.localeCompare(b.finishAt));
  upcoming.sort((a, b) => a.finishAt.localeCompare(b.finishAt));

  return { overdue, today, upcoming };
}

function formatDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
