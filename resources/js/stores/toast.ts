import type { LucideIcon } from 'lucide-react';
import { create } from 'zustand';

// The app's one toast queue (top-right). Callable outside React via useToastStore.getState().push().

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

// Optional glyph override (e.g. a delete shows a trash can)
export type ToastIcon = 'trash' | 'users';

/** Life per tone; an error has none and waits to be dismissed (WCAG 2.2.1). A caller may pass its own `duration`. */
export const TOAST_DURATION: Record<ToastTone, number | null> = {
    success: 4000,
    info: 5000,
    warning: 6000,
    error: null,
};

/** Timed toasts on screen at once; toasts that wait to be dismissed do not count. */
export const TOAST_MAX_TIMED = 5;

/** Gap between two timed toasts entering the screen. */
export const TOAST_STAGGER_MS = 2500;

// Identical toasts (same key) within this window collapse into one
const DEDUPE_MS = 1000;

/** Per-toast overrides for the things the tone cannot decide on its own. */
export interface ToastOptions {
    /** Identity for the duplicate guard; defaults to the message. */
    key?: string;
    /** ms to live, or null to stay until dismissed. Defaults to the tone's. */
    duration?: number | null;
    /** Toasts sharing a group vanish together once one of them is activated. */
    group?: string;
    /** Glyph component override (notification toasts pick theirs per type). */
    Icon?: LucideIcon;
    /** Makes the toast's text a button that runs this. */
    onActivate?: () => void;
    /** Announce politely even in the error tone (a red card for a successful delete). */
    polite?: boolean;
}

export interface Toast {
    id: number;
    key: string;
    message: string;
    tone: ToastTone;
    title?: string;
    icon?: ToastIcon;
    Icon?: LucideIcon;
    /** ms to live, or null to stay until dismissed. */
    duration: number | null;
    group?: string;
    onActivate?: () => void;
    polite?: boolean;
    createdAt: number;
    /** When it entered the screen; null while it waits in the queue. */
    shownAt: number | null;
}

interface ToastState {
    toasts: Toast[];
    /** When the last timed toast entered the screen; paces the next one. */
    lastShownAt: number;
    /** `tone` is required so no caller gets the loudest tone by accident. */
    push: (message: string, tone: ToastTone, title?: string, icon?: ToastIcon, options?: ToastOptions) => void;
    dismiss: (id: number) => void;
    /** Drop every toast in a group except the one just activated (it plays its own slide-out). */
    dismissGroup: (group: string, exceptId: number) => void;
    /** Let the next waiting toast in if a slot is free and the gap has passed. */
    promote: (now?: number) => void;
}

const isTimed = (toast: Toast) => toast.duration !== null;

/**
 * One step of the entrance queue: the oldest waiting timed toast enters when fewer than
 * `max` timed toasts are showing and `gap` has passed since the last one entered.
 * Returns null when nothing may enter yet.
 */
export function promoteNext(
    toasts: Toast[],
    lastShownAt: number,
    now: number,
    max = TOAST_MAX_TIMED,
    gap = TOAST_STAGGER_MS,
): { toasts: Toast[]; lastShownAt: number } | null {
    const waiting = toasts.find((toast) => toast.shownAt === null);
    if (!waiting) return null;
    const showingTimed = toasts.filter((toast) => toast.shownAt !== null && isTimed(toast)).length;
    if (showingTimed >= max || now - lastShownAt < gap) return null;
    return {
        toasts: toasts.map((toast) => (toast.id === waiting.id ? { ...toast, shownAt: now } : toast)),
        lastShownAt: now,
    };
}

/** When the next waiting toast may enter, or null if it waits for a slot (or nothing waits). */
export function nextPromotionAt(toasts: Toast[], lastShownAt: number, max = TOAST_MAX_TIMED, gap = TOAST_STAGGER_MS): number | null {
    if (!toasts.some((toast) => toast.shownAt === null)) return null;
    const showingTimed = toasts.filter((toast) => toast.shownAt !== null && isTimed(toast)).length;
    return showingTimed >= max ? null : lastShownAt + gap;
}

/** Toasts on screen, in the order they entered. */
export function visibleToasts(toasts: Toast[]): Toast[] {
    return toasts.filter((toast) => toast.shownAt !== null).sort((a, b) => a.shownAt! - b.shownAt! || a.id - b.id);
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    lastShownAt: Number.NEGATIVE_INFINITY,
    push: (message, tone, title, icon, options) =>
        set((s) => {
            const now = Date.now();
            const key = options?.key ?? message;
            if (s.toasts.some((toast) => toast.key === key && now - toast.createdAt < DEDUPE_MS)) {
                return s;
            }
            const duration = options?.duration !== undefined ? options.duration : TOAST_DURATION[tone];
            const toast: Toast = {
                id: nextId++,
                key,
                message,
                tone,
                title,
                icon,
                Icon: options?.Icon,
                duration,
                group: options?.group,
                onActivate: options?.onActivate,
                polite: options?.polite,
                createdAt: now,
                // A toast that waits to be dismissed shows at once; timed ones queue
                shownAt: duration === null ? now : null,
            };
            const toasts = [...s.toasts, toast];
            return promoteNext(toasts, s.lastShownAt, now) ?? { toasts };
        }),
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissGroup: (group, exceptId) => set((s) => ({ toasts: s.toasts.filter((t) => t.id === exceptId || t.group !== group) })),
    promote: (now = Date.now()) => set((s) => promoteNext(s.toasts, s.lastShownAt, now) ?? s),
}));
