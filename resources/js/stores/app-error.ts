import { quietPathAfterMove, shouldShowAppError, type AppErrorKind } from '@/shared/lib/http-errors';
import { create } from 'zustand';

// API failures that stop the page (server, network, rate limit, maintenance) for AppErrorDialog; validation and permission errors stay with the caller.
export type { AppErrorKind };

interface AppErrorState {
    kind: AppErrorKind | null;
    retryAfter: number | null; // seconds, from a Retry-After header (429, 503)
    reference: string | null; // X-Request-Id of the failed call, quoted to IT
    quietPath: string | null; // page where the reader closed a server error; it stays quiet there
    shellMounted: boolean; // the signed-in shell is on screen, so the dialog can offer "close"
    show: (kind: AppErrorKind, retryAfter?: number | null, reference?: string | null) => void;
    clear: () => void;
    dismiss: () => void;
    rearm: (path: string) => void;
    setShellMounted: (mounted: boolean) => void;
}

export const useAppErrorStore = create<AppErrorState>((set) => ({
    kind: null,
    retryAfter: null,
    reference: null,
    quietPath: null,
    shellMounted: false,
    show: (kind, retryAfter = null, reference = null) =>
        set((s) => (shouldShowAppError(kind, s.kind, s.quietPath, window.location.pathname) ? { kind, retryAfter, reference } : s)),
    clear: () => set({ kind: null, retryAfter: null, reference: null }),
    dismiss: () => set({ kind: null, retryAfter: null, reference: null, quietPath: window.location.pathname }),
    rearm: (path) =>
        set((s) => {
            const quietPath = quietPathAfterMove(s.quietPath, path);
            return quietPath === s.quietPath ? s : { quietPath };
        }),
    setShellMounted: (shellMounted) => set({ shellMounted }),
}));
