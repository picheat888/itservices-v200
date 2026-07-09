import { create } from 'zustand';

// Lightweight, app-wide transient toasts (bottom-right). Separate from the
// notification toaster (which is bound to server notifications) — this one
// surfaces ad-hoc messages such as the rate-limit warning raised by the axios
// interceptor. Callable from outside React via useToastStore.getState().push().

export type ToastTone = 'error' | 'info';

export interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
    // Optional bold heading rendered above the message on its own line.
    title?: string;
}

interface ToastState {
    toasts: Toast[];
    push: (message: string, tone?: ToastTone, title?: string) => void;
    dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    /** Add a toast. Collapses duplicates of the same message still on screen. */
    push: (message, tone = 'error', title) =>
        set((s) => {
            if (s.toasts.some((t) => t.message === message)) {
                return s;
            }
            return { toasts: [...s.toasts, { id: nextId++, message, tone, title }] };
        }),
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
