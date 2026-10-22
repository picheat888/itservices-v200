// Push on this device: the service worker, the browser's push subscription and the per-device switches in localStorage.
// Every browser API is feature-checked and wrapped, so nothing here throws on a browser without push.
import { queryClient } from '@/shared/lib/query-client';
import { pushSubscriptionApi, type PushSubscriptionPayload } from '../api/notificationApi';
import { isIosDevice, pushState, shouldAutoResubscribe, SNOOZE_MS, type PushState } from './push-rules';

const SW_URL = '/sw.js';
const READY_TIMEOUT_MS = 10_000;

// Storage keys, also read by app/layout/use-notification-toasts.ts
const wantedKey = (userId: number) => `itsd.push.wanted.${userId}`;
const snoozeKey = (userId: number) => `itsd.pushInvite.snoozedUntil.${userId}`;
const soundKey = (userId: number) => `itsd.sound.${userId}`;
// Which person this browser's subscription was saved for
const OWNER_KEY = 'itsd.push.owner';

function readItem(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeItem(key: string, value: string | null): void {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch {
        // Storage blocked: the switch lasts for this page only
    }
}

// Device sound switch
export function deviceSoundOn(userId: number): boolean {
    return readItem(soundKey(userId)) !== 'off';
}

export function setDeviceSound(userId: number, on: boolean): void {
    writeItem(soundKey(userId), on ? 'on' : 'off');
}

// Bell invite snooze
export function inviteSnoozedUntil(userId: number): number | null {
    const raw = Number(readItem(snoozeKey(userId)));

    return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function snoozeInvite(userId: number, now: number = Date.now()): void {
    writeItem(snoozeKey(userId), String(now + SNOOZE_MS));
}

// Browser capabilities
function canUseServiceWorker(): boolean {
    try {
        return window.isSecureContext && 'serviceWorker' in navigator;
    } catch {
        return false;
    }
}

function hasPushManager(): boolean {
    try {
        return canUseServiceWorker() && 'PushManager' in window && 'Notification' in window;
    } catch {
        return false;
    }
}

export function notificationPermission(): NotificationPermission {
    try {
        return 'Notification' in window ? Notification.permission : 'default';
    } catch {
        return 'default';
    }
}

function isIos(): boolean {
    try {
        return isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    } catch {
        return false;
    }
}

function isStandalone(): boolean {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
        return false;
    }
}

// Service worker
export async function registerServiceWorker(): Promise<void> {
    if (!canUseServiceWorker()) return;
    try {
        await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    } catch {
        // Not built yet, or the browser refused: the page works without it
    }
}

/** The active worker's registration, waiting for it to activate (registering first when missing). */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!canUseServiceWorker()) return null;
    try {
        if (!(await navigator.serviceWorker.getRegistration('/'))) await registerServiceWorker();
        const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), READY_TIMEOUT_MS));

        return await Promise.race([navigator.serviceWorker.ready, timeout]);
    } catch {
        return null;
    }
}

/** Sends the worker a message from this page (it only accepts messages from windows). */
export async function postToServiceWorker(message: { type: 'wording'; data: unknown } | { type: 'clear' }): Promise<void> {
    if (!canUseServiceWorker()) return;
    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const worker = registration?.active ?? (await navigator.serviceWorker.ready).active;
        worker?.postMessage(message);
    } catch {
        // No worker: nothing to tell
    }
}

// Subscription
async function currentSubscription(): Promise<PushSubscription | null> {
    if (!hasPushManager()) return null;
    try {
        const registration = await navigator.serviceWorker.getRegistration('/');

        return (await registration?.pushManager.getSubscription()) ?? null;
    } catch {
        return null;
    }
}

/** Subscribed for this person: a subscription saved for someone else on this browser does not count. */
async function subscribedFor(userId: number | undefined): Promise<boolean> {
    if (!(await currentSubscription())) return false;
    const owner = readItem(OWNER_KEY);

    return userId === undefined || owner === null || owner === String(userId);
}

export async function currentPushState(userId?: number): Promise<PushState> {
    try {
        return pushState({
            hasPushManager: hasPushManager(),
            isIos: isIos(),
            standalone: isStandalone(),
            permission: notificationPermission(),
            subscribed: await subscribedFor(userId),
        });
    } catch {
        return 'unsupported';
    }
}

/** The key from the settings the app already holds, else asked of the server. */
async function vapidPublicKey(): Promise<string> {
    const cached = queryClient.getQueryData<{ vapid_public_key?: string }>(['settings'])?.vapid_public_key;
    const key = cached || (await pushSubscriptionApi.publicKey());
    if (!key) throw new Error('No VAPID public key');

    return key;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const binary = window.atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
    if (!current) return false;
    const bytes = new Uint8Array(current);

    return bytes.length === wanted.length && bytes.every((b, i) => b === wanted[i]);
}

function contentEncoding(): PushSubscriptionPayload['content_encoding'] {
    try {
        const supported = (PushManager as unknown as { supportedContentEncodings?: readonly string[] }).supportedContentEncodings ?? [];

        return supported.includes('aes128gcm') ? 'aes128gcm' : 'aesgcm';
    } catch {
        return 'aesgcm';
    }
}

function payloadOf(subscription: PushSubscription): PushSubscriptionPayload {
    const json = subscription.toJSON();

    return {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        content_encoding: contentEncoding(),
    };
}

/** Subscribes this browser (reusing a subscription on the same key) and saves it for this person; permission must already be granted. */
async function subscribeAndSave(userId: number): Promise<void> {
    const registration = await readyRegistration();
    if (!registration) throw new Error('No service worker');
    const key = base64UrlToBytes(await vapidPublicKey());

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
    }
    const isNew = !subscription;
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

    try {
        await pushSubscriptionApi.subscribe(payloadOf(subscription));
    } catch (error) {
        if (isNew) await subscription.unsubscribe().catch(() => false);
        throw error;
    }
    writeItem(OWNER_KEY, String(userId));
    writeItem(wantedKey(userId), '1');
}

async function askPermission(): Promise<NotificationPermission> {
    try {
        // Older Safari answers through the callback only
        return await new Promise<NotificationPermission>((resolve) => {
            const answer = Notification.requestPermission(resolve);
            answer?.then(resolve, () => resolve(notificationPermission()));
        });
    } catch {
        return notificationPermission();
    }
}

/** Asks the browser (call it from a click), then subscribes and saves; throws when the subscription could not be saved. */
export async function enablePush(userId: number): Promise<PushState> {
    if (!hasPushManager()) return currentPushState(userId);
    const permission = await askPermission();
    if (permission !== 'granted') return currentPushState(userId);
    await subscribeAndSave(userId);

    return currentPushState(userId);
}

/** Stops push on this browser; keepWanted lets the same person's next sign-in subscribe again. Never throws. */
export async function disablePush(userId: number, opts: { keepWanted: boolean }): Promise<void> {
    if (!opts.keepWanted) writeItem(wantedKey(userId), '0');
    const subscription = await currentSubscription();
    if (!subscription || !(await subscribedFor(userId))) return;
    await Promise.allSettled([pushSubscriptionApi.unsubscribe(subscription.endpoint), subscription.unsubscribe()]);
    writeItem(OWNER_KEY, null);
}

/** After sign-in: the person who had push on here gets it back without being asked again. Never throws. */
export async function resubscribeIfWanted(userId: number): Promise<void> {
    try {
        if (!hasPushManager()) return;
        const wanted = readItem(wantedKey(userId)) === '1';
        if (!shouldAutoResubscribe(wanted, notificationPermission(), await subscribedFor(userId))) return;
        await subscribeAndSave(userId);
    } catch {
        // Tried again at the next sign-in or page load
    }
}

/** Queues a test push to this browser's subscription; throws when there is none or the server refuses. */
export async function sendTestPush(): Promise<void> {
    const subscription = await currentSubscription();
    if (!subscription) throw new Error('Not subscribed');
    await pushSubscriptionApi.test(subscription.endpoint);
}
