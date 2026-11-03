// Colours and words shared by the monitor TV parts: priority dots, group inks.
import type { MonitorGroup, MonitorRow } from '../types';

export const PRIORITY_DOT: Record<NonNullable<MonitorRow['priority']>, string> = {
    critical: 'bg-red-400',
    high: 'bg-orange-400',
    medium: 'bg-blue-400',
    low: 'bg-slate-400',
};

export const priorityDot = (priority: MonitorRow['priority']) => (priority ? PRIORITY_DOT[priority] : 'bg-slate-600');

export const priorityKey = (priority: MonitorRow['priority']) => (priority ? `ticket_prio_${priority}` : null);

export const GROUP_INK: Record<MonitorGroup, string> = {
    overdue: 'text-red-400',
    near: 'text-amber-400',
    waiting: 'text-blue-400',
};

export const GROUP_DOT: Record<MonitorGroup, string> = {
    overdue: 'bg-red-400',
    near: 'bg-amber-400',
    waiting: 'bg-blue-400',
};
