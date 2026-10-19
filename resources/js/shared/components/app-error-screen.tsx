import { translate } from '@/lang';
import { useConnectionRecovery } from '@/shared/hooks/use-connection-recovery';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useAppErrorStore, type AppErrorKind } from '@/stores/app-error';
import { useUiStore } from '@/stores/ui';
import { Ban, RotateCw, ServerCrash, WifiOff, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';

// Full-screen takeover for system/transient API failures. Words come from the bundled dictionaries, so they show even when the API is down.
const COPY: Record<AppErrorKind, { icon: ComponentType<{ className?: string }>; title: string; message: string }> = {
    server: { icon: ServerCrash, title: 'err_server_title', message: 'err_server_body' },
    network: { icon: WifiOff, title: 'err_network_title', message: 'err_network_body' },
    'rate-limit': { icon: Ban, title: 'err_throttle_title', message: 'err_throttle_body' },
    maintenance: { icon: Wrench, title: 'err_maintenance_title', message: 'err_maintenance_body' },
};

/** Renders nothing until the app-error store holds an error, then covers the viewport with a message and Reload (driven by shared/lib/http.ts). */
export function AppErrorScreen() {
    const kind = useAppErrorStore((s) => s.kind);
    const retryAfter = useAppErrorStore((s) => s.retryAfter);
    const reference = useAppErrorStore((s) => s.reference);
    const lang = useUiStore((s) => s.lang);
    const connection = useConnectionRecovery(kind === 'network');

    if (!kind) return null;

    const { icon: Icon, title, message } = COPY[kind];
    const detail = retryAfter ? translate(lang, 'err_retry_after').replace('{n}', formatNumber(retryAfter, lang)) : null;
    // Offline, a reload would only bring the browser's own offline page
    const isNetwork = kind === 'network';

    return (
        <div className="bg-background fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="bg-destructive/10 text-destructive flex h-16 w-16 items-center justify-center rounded-2xl">
                <Icon className="h-8 w-8" />
            </span>
            <div className="space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight">{translate(lang, title)}</h1>
                <p className="text-muted-foreground max-w-md text-sm">{translate(lang, message)}</p>
                {detail && <p className="text-foreground text-sm font-medium">{detail}</p>}
                {reference && <p className="text-muted-foreground pt-1 text-xs">{translate(lang, 'err_reference').replace('{id}', reference)}</p>}
                <p aria-live="polite" className="text-foreground text-sm font-medium empty:hidden">
                    {isNetwork && connection.stillDown ? translate(lang, 'err_network_still') : ''}
                </p>
            </div>
            {isNetwork ? (
                <Button onClick={connection.retry} disabled={connection.checking}>
                    <RotateCw className={cn('h-4 w-4', connection.checking && 'animate-spin')} />
                    {translate(lang, 'retry')}
                </Button>
            ) : (
                <Button onClick={() => window.location.reload()}>
                    <RotateCw className="h-4 w-4" />
                    {translate(lang, 'session_reload')}
                </Button>
            )}
        </div>
    );
}
