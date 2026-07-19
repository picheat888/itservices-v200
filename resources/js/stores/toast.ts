import { create } from 'zustand';

// Lightweight, app-wide transient toasts (bottom-right). Separate from the
// notification toaster (which is bound to server notifications) — this one
// surfaces ad-hoc messages such as the rate-limit warning raised by the axios
// interceptor. Callable from outside React via useToastStore.getState().push().

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

// Optional glyph override — normally the icon is derived from the tone, but some
// actions read clearer with a dedicated icon (e.g. a delete shows a trash can).
export type ToastIcon = 'trash' | 'users';

export interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
    // Optional bold heading rendered above the message on its own line.
    title?: string;
    // Optional icon override; falls back to the tone's default icon when omitted.
    icon?: ToastIcon;
    // When the toast was created (ms) — used to collapse only rapid duplicates.
    createdAt: number;
}

interface ToastState {
    toasts: Toast[];
    push: (message: string, tone?: ToastTone, title?: string, icon?: ToastIcon) => void;
    dismiss: (id: number) => void;
}

let nextId = 1;

// Identical messages fired within this window collapse into one (burst guard —
// e.g. a 429 warning repeated across parallel requests). A repeat *after* the
// window re-pops a fresh toast, so a deliberate re-save still shows feedback.
const DEDUPE_MS = 1000;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    /**
     * Add a toast. Only *rapid* duplicates of the same message (within DEDUPE_MS)
     * are collapsed — the burst guard for things like a 429 warning fired across
     * parallel requests. A later repeat (e.g. a deliberate re-save) stacks a fresh
     * toast on top instead of reusing the old one.
     */
    push: (message, tone = 'error', title, icon) =>
        set((s) => {
            const now = Date.now();
            const recent = s.toasts.find((t) => t.message === message && now - t.createdAt < DEDUPE_MS);
            if (recent) {
                return s;
            }
            return { toasts: [...s.toasts, { id: nextId++, message, tone, title, icon, createdAt: now }] };
        }),
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
