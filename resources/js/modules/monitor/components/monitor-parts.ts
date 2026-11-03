// Colours and words shared by the monitor TV parts: priority dots, group inks.
import { TICKET_PRIORITY_TONE } from '@/modules/report';
import { toneDots } from '@/shared/components/status-badge';
import type { MonitorGroup, MonitorRow } from '../types';

/** Priority dots in the same tones as the rest of the app (critical red, high amber, medium blue, low grey). */
export const priorityDot = (priority: MonitorRow['priority']) => (priority ? toneDots[TICKET_PRIORITY_TONE[priority]] : toneDots.gray);

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
