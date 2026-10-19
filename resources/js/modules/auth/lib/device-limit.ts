// Pure helpers for the device-limit sign-in dialog and the "signed out by" notice; no React, so node tests load it as is.
import type { DeviceLimitResponse, UserDevice } from '@/modules/auth/api/authApi';
import type { SignedOutBy } from '@/shared/lib/login-redirect';

type Translate = (key: string) => string;

interface FailureShape {
    response?: { status?: number; data?: unknown };
}

// The server sends the families it could not tell as "Other"
const OTHER_FAMILY = 'Other';
const familyWord = (name: string, t: Translate): string => (name === OTHER_FAMILY ? t('device_other') : name);

const fill = (template: string, values: Record<string, string>): string =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, () => value), template);

/** "Sign in" unlocks once at least one device is signed out. */
export function canContinue(signedOut: ReadonlySet<number>): boolean {
    return signedOut.size > 0;
}

/** "{os}, {browser}" */
export function deviceLine(d: Pick<UserDevice, 'os' | 'browser'>, t: Translate): string {
    return `${familyWord(d.os, t)}, ${familyWord(d.browser, t)}`;
}

/** "{location} ({ip})"; whichever is missing is left out, and '' when both are. */
export function placeLine(d: Pick<UserDevice, 'ip' | 'location'>): string {
    if (d.location && d.ip) return `${d.location} (${d.ip})`;
    return d.location || d.ip || '';
}

/** The "{device} in {location} at {time}" line under the third_device notice. */
export function signedOutByLine(by: SignedOutBy, t: Translate, formatTime: (iso: string) => string): string {
    const device = deviceLine(by, t);
    const time = formatTime(by.at);
    if (!by.location) return fill(t('login_notice_by_no_location'), { device, time });
    return fill(t('login_notice_by'), { device, location: by.location, time });
}

/** The dialog data from a 409 device_limit answer, or null when the failure is anything else. */
export function deviceLimitOf(error: unknown): DeviceLimitResponse | null {
    const response = (error as FailureShape | null)?.response;
    if (response?.status !== 409 || typeof response.data !== 'object' || response.data === null) return null;
    const { message, limit, pending, expires_in, devices } = response.data as Record<string, unknown>;
    if (message !== 'device_limit' || typeof limit !== 'number' || typeof pending !== 'string' || pending === '' || !Array.isArray(devices)) {
        return null;
    }
    const expiresIn = typeof expires_in === 'number' && expires_in > 0 ? expires_in : null;
    return { limit, pending, expires_in: expiresIn, devices: devices as UserDevice[] };
}

/** The dialog's time limit in whole minutes (rounded up), or null when there is none to show. */
export function pendingMinutes(seconds: number | null): number | null {
    return seconds !== null && seconds > 0 ? Math.ceil(seconds / 60) : null;
}

/** The 403 for a pending token that expired, was used, or belongs to another browser. */
export function isPendingExpired(error: unknown): boolean {
    const response = (error as FailureShape | null)?.response;
    const data = response?.data as { message?: unknown } | null | undefined;
    return response?.status === 403 && data?.message === 'pending_expired';
}
