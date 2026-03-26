import type { TaskData } from './parser.js';

// This module aggregates tasks from calendar events and course details
// It serves as the single source of truth for all tasks

export function deduplicateTasks(tasks: TaskData[]): TaskData[] {
  const seen = new Map<string, TaskData>();

  for (const task of tasks) {
    const existing = seen.get(task.id);
    if (!existing) {
      seen.set(task.id, task);
    } else {
      // Merge: prefer the one with more data
      seen.set(task.id, {
        ...existing,
        subject: existing.subject || task.subject,
        description: existing.description || task.description,
        zoomLink: existing.zoomLink || task.zoomLink,
      });
    }
  }

  return Array.from(seen.values());
}

export function categorizeTasks(tasks: TaskData[]): {
  overdue: TaskData[];
  today: TaskData[];
  upcoming: TaskData[];
} {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const overdue: TaskData[] = [];
  const today: TaskData[] = [];
  const upcoming: TaskData[] = [];

  for (const task of tasks) {
    if (task.status === 'done') continue;

    if (task.dueDate < todayStr) {
      overdue.push(task);
    } else if (task.dueDate === todayStr) {
      today.push(task);
    } else {
      upcoming.push(task);
    }
  }

  // Sort upcoming by date
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return { overdue, today, upcoming };
}
