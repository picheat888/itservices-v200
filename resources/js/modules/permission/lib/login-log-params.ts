// Reads the Login tab's URL values (?event, ?from, ?to) into what the list asks the server for; no React, so node tests load it as is.
import type { LoginEventType } from '@/modules/auth/api/authApi';

/** The event filter's choices, in the order the select lists them. */
export const LOGIN_EVENT_FILTERS: readonly LoginEventType[] = ['signed_in', 'failed', 'locked', 'signed_out', 'forced_out'];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The event from ?event, or '' (every event) when it names none of the choices. */
export function readLoginEvent(raw: string): LoginEventType | '' {
    return LOGIN_EVENT_FILTERS.find((event) => event === raw) ?? '';
}

/** Whether the text is a real calendar day written as YYYY-MM-DD. */
function isRealDay(text: string): boolean {
    const match = ISO_DAY.exec(text);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The range from ?from and ?to; null unless both are real days and the range does not run backwards. */
export function readLoginRange(from: string, to: string): { from: string; to: string } | null {
    return isRealDay(from) && isRealDay(to) && from <= to ? { from, to } : null;
}
