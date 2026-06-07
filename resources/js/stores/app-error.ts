import { create } from 'zustand';

// System/transient API failures that take over the whole screen (vs. validation
// or permission errors, which are handled inline by the caller).
export type AppErrorKind = 'server' | 'network' | 'rate-limit';

interface AppErrorState {
    kind: AppErrorKind | null;
    retryAfter: number | null; // seconds, from a 429 Retry-After header
    show: (kind: AppErrorKind, retryAfter?: number | null) => void;
    clear: () => void;
}

export const useAppErrorStore = create<AppErrorState>((set) => ({
    kind: null,
    retryAfter: null,
    show: (kind, retryAfter = null) => set({ kind, retryAfter }),
    clear: () => set({ kind: null, retryAfter: null }),
}));
