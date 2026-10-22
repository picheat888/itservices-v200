// Service worker: shows each web push as one stacked OS notification, worded like the bell in the reader's language.
// Built on its own by vite.sw.config.js into public/build/sw.js (served at /sw.js); must stay free of React.
import { translate } from '@/lang/translate';
import type { Lang } from '@/lang/types';
import type { AppNotification, NotificationData, Translate } from '@/modules/notification';
import { notificationMessage, notificationTarget, notificationTitle } from '@/modules/notification/lib/notification-text';
import { formatNumber } from '@/shared/lib/number';
import { isApplePush, nextStack, stackBody, stackTarget, type StackState } from './stack';

// Service worker globals (the project's TypeScript lib is DOM, not WebWorker)
interface SwExtendableEvent extends Event {
    waitUntil(promise: Promise<unknown>): void;
}
interface SwPushEvent extends SwExtendableEvent {
    readonly data: { text(): string } | null;
}
interface SwNotificationEvent extends SwExtendableEvent {
    readonly notification: Notification;
}
interface SwMessageEvent extends SwExtendableEvent {
    readonly data: unknown;
}
interface SwWindowClient {
    readonly visibilityState: DocumentVisibilityState;
    focus(): Promise<SwWindowClient>;
    navigate(url: string): Promise<SwWindowClient | null>;
}
interface SwScope {
    readonly location: Location;
    readonly registration: ServiceWorkerRegistration;
    readonly clients: {
        matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<SwWindowClient[]>;
        openWindow(url: string): Promise<SwWindowClient | null>;
        claim(): Promise<void>;
    };
    skipWaiting(): Promise<void>;
    addEventListener(type: 'install' | 'activate', listener: (event: SwExtendableEvent) => void): void;
    addEventListener(type: 'push', listener: (event: SwPushEvent) => void): void;
    addEventListener(type: 'notificationclick', listener: (event: SwNotificationEvent) => void): void;
    addEventListener(type: 'message', listener: (event: SwMessageEvent) => void): void;
}

type Wording = Record<string, { en?: string; th?: string }>;
type PushPayload = { v?: number; id?: string; lang?: string; data?: NotificationData; truncated?: boolean; test?: boolean };

const sw = self as unknown as SwScope;
const TAG = 'itsd-bell';
const BELL_TARGET = '/?bell=1';
const WORDING_CACHE = 'itsd-sw';
const WORDING_URL = '/__sw/wording';

// Wording overrides (Cache Storage)
async function readWording(): Promise<Wording> {
    try {
        const cache = await caches.open(WORDING_CACHE);
        const response = await cache.match(WORDING_URL);
        const parsed: unknown = response ? await response.json() : null;
        return parsed && typeof parsed === 'object' ? (parsed as Wording) : {};
    } catch {
        return {};
    }
}

async function saveWording(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const cache = await caches.open(WORDING_CACHE);
    await cache.put(WORDING_URL, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
}

// Payload and stack state
function parsePayload(event: SwPushEvent): PushPayload | null {
    try {
        const parsed: unknown = event.data ? JSON.parse(event.data.text()) : null;
        return parsed && typeof parsed === 'object' ? (parsed as PushPayload) : null;
    } catch {
        return null;
    }
}

function stackStateOf(data: unknown): StackState | null {
    if (!data || typeof data !== 'object') return null;
    const state = data as Partial<StackState>;
    return typeof state.count === 'number' && typeof state.lastSoundAt === 'number' && typeof state.firstTarget === 'string'
        ? { count: state.count, lastSoundAt: state.lastSoundAt, firstTarget: state.firstTarget }
        : null;
}

/** A `?…` target opens over the app's home page. */
function pathOf(target: string): string {
    return target.startsWith('?') ? `/${target}` : target;
}

function bellText(payload: PushPayload | null, t: Translate, lang: Lang): { title: string; message: string; target: string } {
    if (payload?.test) {
        return { title: t('notification_push_test_title'), message: t('notification_push_test_body'), target: '/' };
    }
    if (!payload || payload.truncated || !payload.data?.type) {
        return { title: t('notif_title'), message: '', target: BELL_TARGET };
    }
    const n: AppNotification = { id: payload.id ?? '', data: payload.data, read: false, created_at: '' };

    return { title: notificationTitle(n, t, lang), message: notificationMessage(n, t, lang), target: pathOf(notificationTarget(n)) };
}

/** A visible page plays the sound itself, except on Safari, which revokes a push that showed nothing. */
async function pageShowsIt(): Promise<boolean> {
    const subscription = await sw.registration.pushManager.getSubscription();
    if (subscription && isApplePush(subscription.endpoint)) return false;
    const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return windows.some((client) => client.visibilityState === 'visible');
}

async function onPush(event: SwPushEvent): Promise<void> {
    const payload = parsePayload(event);
    if (await pageShowsIt()) return;

    const lang: Lang = payload?.lang === 'th' ? 'th' : 'en';
    const wording = await readWording();
    const t: Translate = (key) => wording[key]?.[lang] ?? translate(lang, key);
    const { title, message, target } = bellText(payload, t, lang);

    // A test push always shows on its own
    const existing = payload?.test ? [] : await sw.registration.getNotifications({ tag: TAG });
    const { renotify, ...state } = nextStack(stackStateOf(existing[0]?.data), target, Date.now());
    const body = stackBody(message, state.count, (n) => t('notification_push_more').replaceAll('{n}', formatNumber(n, lang)));
    const options: NotificationOptions & { renotify: boolean } = { tag: TAG, renotify, body, data: state, icon: '/logo.png' };

    await sw.registration.showNotification(title, options);
}

async function onClick(event: SwNotificationEvent): Promise<void> {
    event.notification.close();
    const state = stackStateOf(event.notification.data);
    const url = new URL(state ? stackTarget(state) : '/', sw.location.origin).href;

    const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((w) => w.visibilityState === 'visible') ?? windows[0];
    if (client) {
        try {
            await client.focus();
            await client.navigate(url);
            return;
        } catch {
            // An uncontrolled tab cannot be navigated from here; open a new one instead
        }
    }
    await sw.clients.openWindow(url);
}

async function clearStack(): Promise<void> {
    const shown = await sw.registration.getNotifications({ tag: TAG });
    shown.forEach((notification) => notification.close());
}

async function onMessage(event: SwMessageEvent): Promise<void> {
    const message = event.data as { type?: string; data?: unknown } | null;
    if (message?.type === 'wording') await saveWording(message.data);
    if (message?.type === 'clear') await clearStack();
}

// Lifecycle
sw.addEventListener('install', (event) => event.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

// Events
sw.addEventListener('push', (event) => event.waitUntil(onPush(event)));
sw.addEventListener('notificationclick', (event) => event.waitUntil(onClick(event)));
sw.addEventListener('message', (event) => event.waitUntil(onMessage(event)));
