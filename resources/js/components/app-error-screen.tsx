import { Button } from '@/shared/ui/button';
import { useAppErrorStore, type AppErrorKind } from '@/stores/app-error';
import { Ban, RotateCw, ServerCrash, WifiOff } from 'lucide-react';
import type { ComponentType } from 'react';

// Full-screen takeover for system/transient API failures. English copy by design.
const COPY: Record<AppErrorKind, { icon: ComponentType<{ className?: string }>; title: string; message: string }> = {
    server: {
        icon: ServerCrash,
        title: 'Something went wrong',
        message: 'The server ran into a problem. Please try again in a moment.',
    },
    network: {
        icon: WifiOff,
        title: 'Connection lost',
        message: "We can't reach the server. Check your internet connection and try again.",
    },
    'rate-limit': {
        icon: Ban,
        title: 'Too many requests',
        message: "You've made too many requests in a short time. Please wait a moment and try again.",
    },
};

/**
 * Renders nothing until the app-error store holds an error, then covers the whole
 * viewport with a clear message + Reload action. Driven by the axios interceptor (services/http.ts).
 */
export function AppErrorScreen() {
    const kind = useAppErrorStore((s) => s.kind);
    const retryAfter = useAppErrorStore((s) => s.retryAfter);

    if (!kind) return null;

    const { icon: Icon, title, message } = COPY[kind];
    const detail = kind === 'rate-limit' && retryAfter ? `Try again in about ${retryAfter} second${retryAfter > 1 ? 's' : ''}.` : null;

    return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Icon className="h-8 w-8" />
            </span>
            <div className="space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="max-w-md text-sm text-muted-foreground">{message}</p>
                {detail && <p className="text-sm font-medium text-foreground">{detail}</p>}
            </div>
            <Button onClick={() => window.location.reload()}>
                <RotateCw className="h-4 w-4" />
                Reload
            </Button>
        </div>
    );
}
