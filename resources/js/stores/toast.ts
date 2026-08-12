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
    /** Resolved at push time: the moment this toast is allowed on screen. A burst
     *  is spread out rather than landing at once — see TOAST_STAGGER_MS. */
    revealAt: number;
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

/**
 * Gap between two toasts entering the screen.
 *
 * A burst — three notifications arriving on the same poll, say — used to land in
 * the same frame: three cards appearing at once, counting down together, and
 * nobody reads three at once. They still stack (up to MAX_VISIBLE), but they now
 * arrive one at a time, and because a card starts its countdown when it appears,
 * each one gets its full life to be read.
 */
export const TOAST_STAGGER_MS = 1200;

/**
 * Ceiling on how far ahead the entrance queue may run.
 *
 * Staggering is for the handful of toasts that arrive together. A genuine pile —
 * a queue worker filing a dozen notifications in one go — must not turn into a
 * dribble that keeps popping cards for a quarter of a minute; past the ceiling
 * they land together and the three-at-once rule takes over as it did before.
 */
const MAX_STAGGER_AHEAD_MS = TOAST_STAGGER_MS * 3;

// When the most recently queued toast is due on screen. Kept outside the store
// because it describes the *entrance* schedule, not what is currently shown: a
// toast dismissed early must not pull the one behind it forward.
let lastRevealAt = 0;

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
            // Queue behind whatever is already waiting; a toast pushed after a quiet
            // spell (lastRevealAt already past) shows immediately, and no toast ever
            // waits longer than the ceiling however deep the burst.
            const revealAt = Math.min(Math.max(now, lastRevealAt + TOAST_STAGGER_MS), now + MAX_STAGGER_AHEAD_MS);
            lastRevealAt = revealAt;
            const toast: Toast = {
                id: nextId++,
                key,
                revealAt,
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
 * Which toasts are on screen at `now`, given how many fit.
 *
 * A toast whose `revealAt` is still ahead is not a candidate at all — it is
 * waiting for its turn in the entrance queue (TOAST_STAGGER_MS).
 *
 * Of the ones that are due: toasts that never expire (errors) hold their slots
 * rather than being pushed off by newer traffic — they are the ones somebody still
 * has to read. The remaining slots go to the most recent timed toasts; anything
 * that doesn't fit stays in the queue and slides in as slots free up, so nothing
 * is dropped.
 *
 * A pure function so the rule can be tested on its own, away from the DOM.
 */
export function visibleToasts(toasts: Toast[], max: number, now: number = Date.now()): Toast[] {
    const due = toasts.filter((toast) => toast.revealAt <= now);
    const sticky = due.filter((toast) => toast.duration === null);
    const timed = due.filter((toast) => toast.duration !== null);
    const room = Math.max(0, max - sticky.length);
    // Math.max(0, …) matters: a negative start means "the last N" to slice(), so with
    // two toasts and three slots the first one silently dropped off screen and then
    // reappeared as the queue filled — remounting it, which replayed its entrance and
    // restarted its countdown from the top.
    return [...sticky, ...timed.slice(Math.max(0, timed.length - room))].slice(0, max);
}

/**
 * When the next queued toast is due on screen, or null if none are waiting — the
 * toaster uses it to wake up exactly once per arrival instead of ticking.
 */
export function nextRevealAt(toasts: Toast[], now: number = Date.now()): number | null {
    const pending = toasts.filter((toast) => toast.revealAt > now).map((toast) => toast.revealAt);
    return pending.length > 0 ? Math.min(...pending) : null;
}
