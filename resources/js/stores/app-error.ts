import { create } from 'zustand';

// System/transient API failures that take over the whole screen (vs. validation
// or permission errors, which are handled inline by the caller).
export type AppErrorKind = 'server' | 'network' | 'rate-limit';

interface AppErrorState {
    kind: AppErrorKind | null;
    retryAfter: number | null; // seconds, from a 429 Retry-After header
    reference: string | null; // X-Request-Id of the failed call, quoted to IT
    show: (kind: AppErrorKind, retryAfter?: number | null, reference?: string | null) => void;
    clear: () => void;
}

export const useAppErrorStore = create<AppErrorState>((set) => ({
    kind: null,
    retryAfter: null,
    reference: null,
    show: (kind, retryAfter = null, reference = null) => set({ kind, retryAfter, reference }),
    clear: () => set({ kind: null, retryAfter: null, reference: null }),
}));
