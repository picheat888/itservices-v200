import type { LucideIcon } from 'lucide-react';
import { create } from 'zustand';

// The app's ONE toast queue (bottom-right). Everything that pops a toast goes
// through here — ad-hoc messages from a save/delete, the rate-limit warning
// raised by the axios interceptor, and server notifications that arrive while
// the session is open (see app/layout/use-notification-toasts.ts). One queue is
// what keeps two stacks from rendering over each other in the same corner and
// what makes "at most three on screen" a number that actually holds.
//
// Callable from outside React via useToastStore.getState().push().

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

// Optional glyph override — normally the icon is derived from the tone, but some
// actions read clearer with a dedicated icon (e.g. a delete shows a trash can).
export type ToastIcon = 'trash' | 'users';

/**
 * How long each tone stays before it auto-dismisses.
 *
 * `error` is null on purpose: an error is something the reader has to act on, so
 * it waits to be dismissed instead of expiring while they are looking elsewhere
 * (WCAG 2.2.1 — a message with a deadline has to be pausable or removable). The
 * rest scale with how much there is to read.
 *
 * A caller that means something else — a red "deleted" confirmation, say, which
 * borrows the error tone for its colour but is not a failure — passes its own
 * `duration`.
 */
export const TOAST_DURATION: Record<ToastTone, number | null> = {
    success: 4000,
    info: 5000,
    warning: 6000,
    error: null,
};

/** Per-toast overrides for the things the tone cannot decide on its own. */
export interface ToastOptions {
    /** Identity for the burst guard; defaults to the message. Two different
     *  notifications that happen to read alike should pass distinct keys. */
    key?: string;
    /** ms to live, or null to stay until dismissed. Defaults to the tone's. */
    duration?: number | null;
    /** Toasts sharing a group vanish together once one of them is activated —
     *  three alerts about the same page shouldn't queue up behind the tap that
     *  already took you there. */
    group?: string;
    /** Glyph component override (used by notification toasts, whose icon is
     *  chosen per notification type rather than per tone). */
    Icon?: LucideIcon;
    /** Makes the whole card activatable (click / Enter / Space). */
    onActivate?: () => void;
}

export interface Toast {
    id: number;
    /** What the burst guard compares — see ToastOptions.key. */
    key: string;
    message: string;
    tone: ToastTone;
    // Optional bold heading rendered above the message on its own line.
    title?: string;
    // Optional icon override; falls back to the tone's default icon when omitted.
    icon?: ToastIcon;
    Icon?: LucideIcon;
    /** Resolved at push time: ms to live, or null to stay until dismissed. */
    duration: number | null;
    group?: string;
    onActivate?: () => void;
    // When the toast was created (ms) — used to collapse only rapid duplicates.
    createdAt: number;
}

interface ToastState {
    toasts: Toast[];
    /**
     * `tone` is required on purpose. It used to default to 'error', which quietly
     * turned "3 onboarding requests filed" into a red card — the caller had said
     * nothing about the tone and got the loudest one. Stating it is one word, and
     * the compiler now asks for it.
     */
    push: (message: string, tone: ToastTone, title?: string, icon?: ToastIcon, options?: ToastOptions) => void;
    dismiss: (id: number) => void;
    dismissGroup: (group: string, exceptId: number) => void;
}

let nextId = 1;

// Identical toasts fired within this window collapse into one (burst guard —
// e.g. a 429 warning repeated across parallel requests). A repeat *after* the
// window re-pops a fresh toast, so a deliberate re-save still shows feedback.
const DEDUPE_MS = 1000;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    /**
     * Add a toast. Only *rapid* duplicates of the same key (within DEDUPE_MS)
     * are collapsed — the burst guard for things like a 429 warning fired across
     * parallel requests. A later repeat (e.g. a deliberate re-save) stacks a fresh
     * toast on top instead of reusing the old one.
     */
    push: (message, tone, title, icon, options) =>
        set((s) => {
            const now = Date.now();
            const key = options?.key ?? message;
            const recent = s.toasts.find((t) => t.key === key && now - t.createdAt < DEDUPE_MS);
            if (recent) {
                return s;
            }
            const toast: Toast = {
                id: nextId++,
                key,
                message,
                tone,
                title,
                icon,
                Icon: options?.Icon,
                duration: options?.duration !== undefined ? options.duration : TOAST_DURATION[tone],
                group: options?.group,
                onActivate: options?.onActivate,
                createdAt: now,
            };
            return { toasts: [...s.toasts, toast] };
        }),
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    /**
     * Drop every toast in a group except the one that was just activated — it
     * stays so it can play its own slide-out instead of being yanked mid-tap.
     */
    dismissGroup: (group, exceptId) => set((s) => ({ toasts: s.toasts.filter((t) => t.id === exceptId || t.group !== group) })),
}));

/**
 * Which toasts are on screen, given how many fit.
 *
 * Toasts that never expire (errors) hold their slots rather than being pushed off
 * by newer traffic — they are the ones somebody still has to read. The remaining
 * slots go to the most recent timed toasts; anything that doesn't fit stays in the
 * queue and slides in as slots free up, so nothing is dropped.
 *
 * A pure function so the rule can be tested on its own, away from the DOM.
 */
export function visibleToasts(toasts: Toast[], max: number): Toast[] {
    const sticky = toasts.filter((toast) => toast.duration === null);
    const timed = toasts.filter((toast) => toast.duration !== null);
    const room = Math.max(0, max - sticky.length);
    return [...sticky, ...timed.slice(timed.length - room)].slice(0, max);
}
