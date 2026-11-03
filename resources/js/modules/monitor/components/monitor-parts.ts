// Colours and words shared by the monitor TV parts: priority dots, group inks.
import type { MonitorGroup, MonitorRow } from '../types';

export const PRIORITY_DOT: Record<NonNullable<MonitorRow['priority']>, string> = {
    critical: 'bg-red-600 dark:bg-red-400',
    high: 'bg-orange-600 dark:bg-orange-400',
    medium: 'bg-blue-600 dark:bg-blue-400',
    low: 'bg-slate-500 dark:bg-slate-400',
};

export const priorityDot = (priority: MonitorRow['priority']) => (priority ? PRIORITY_DOT[priority] : 'bg-slate-600');

export const priorityKey = (priority: MonitorRow['priority']) => (priority ? `ticket_prio_${priority}` : null);

export const GROUP_INK: Record<MonitorGroup, string> = {
    overdue: 'text-red-700 dark:text-red-400',
    near: 'text-amber-800 dark:text-amber-400',
    waiting: 'text-blue-700 dark:text-blue-400',
};

export const GROUP_DOT: Record<MonitorGroup, string> = {
    overdue: 'bg-red-600 dark:bg-red-400',
    near: 'bg-amber-600 dark:bg-amber-400',
    waiting: 'bg-blue-600 dark:bg-blue-400',
};
