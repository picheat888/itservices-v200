import { outranks, type AppErrorKind } from '@/shared/lib/http-errors';
import { create } from 'zustand';

// System/transient API failures that take over the whole screen (vs. validation
// or permission errors, which are handled inline by the caller).
export type { AppErrorKind };

interface AppErrorState {
    kind: AppErrorKind | null;
    retryAfter: number | null; // seconds, from a Retry-After header (429, 503)
    reference: string | null; // X-Request-Id of the failed call, quoted to IT
    show: (kind: AppErrorKind, retryAfter?: number | null, reference?: string | null) => void;
    clear: () => void;
}

export const useAppErrorStore = create<AppErrorState>((set) => ({
    kind: null,
    retryAfter: null,
    reference: null,
    show: (kind, retryAfter = null, reference = null) => set((s) => (outranks(kind, s.kind) ? { kind, retryAfter, reference } : s)),
    clear: () => set({ kind: null, retryAfter: null, reference: null }),
}));
