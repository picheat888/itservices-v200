// Errors that stop the page (server, network, rate limit, maintenance) as a dialog over the blurred app, driven by stores/app-error.
// Words come from the bundled dictionaries, so they show even when the API is down.
import { useT } from '@/lang';
import { BlockingDialog, useTopDialogOpen } from '@/shared/components/blocking-dialog';
import { CountdownRing } from '@/shared/components/countdown-ring';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { useConnectionRecovery } from '@/shared/hooks/use-connection-recovery';
import { useCountdown } from '@/shared/hooks/use-countdown';
import { retryFailedQueries } from '@/shared/lib/app-error-actions';
import { clock, elapsedShare } from '@/shared/lib/countdown';
import { formatNumber } from '@/shared/lib/number';
import { Button } from '@/shared/ui/button';
import { useAppErrorStore } from '@/stores/app-error';
import { useUiStore } from '@/stores/ui';
import { Hourglass, Loader2, ServerCrash, WifiOff, Wrench, type LucideIcon } from 'lucide-react';

const RING_TONE = {
    wait: 'text-amber-600 dark:text-amber-400',
    info: 'text-brand',
    ready: 'text-emerald-600 dark:text-emerald-400',
};

export function AppErrorDialog() {
    const kind = useAppErrorStore((s) => s.kind);
    // Waits in the store under the idle warning or account switch, so their buttons keep working
    const topDialogOpen = useTopDialogOpen();

    if (!kind || topDialogOpen) return null;

    return (
        <BlockingDialog layer="wall">
            <div className="p-6">
                {kind === 'server' && <ServerBody />}
                {kind === 'network' && <NetworkBody />}
                {kind === 'rate-limit' && <RateLimitBody />}
                {kind === 'maintenance' && <MaintenanceBody />}
            </div>
        </BlockingDialog>
    );
}

// Screen-reader only; empty until there is something to say
function LiveRegion({ text }: { text: string }) {
    return (
        <span role="status" aria-live="polite" className="sr-only">
            {text}
        </span>
    );
}

function ServerBody() {
    const t = useT();
    const reference = useAppErrorStore((s) => s.reference);
    const shellMounted = useAppErrorStore((s) => s.shellMounted);
    const dismiss = useAppErrorStore((s) => s.dismiss);

    return (
        <ErrorState
            variant="dialog"
            visual={<ErrorIcon icon={ServerCrash} tone="danger" />}
            title={t('err_load_title')}
            lines={[t('err_server_body'), t('err_report_it')]}
            reference={reference}
            actions={
                <>
                    {/* First focus on Retry */}
                    <Button className="w-full" autoFocus onClick={() => retryFailedQueries()}>
                        {t('retry')}
                    </Button>
                    {shellMounted && (
                        <Button variant="ghost" className="text-muted-foreground w-full" onClick={dismiss}>
                            {t('close')}
                        </Button>
                    )}
                </>
            }
        />
    );
}

function NetworkBody() {
    const t = useT();
    const connection = useConnectionRecovery(true);
    // Cleared while a check runs, so every failed try is announced again
    const spoken = connection.stillDown && !connection.checking ? t('err_network_still') : '';

    return (
        <>
            <ErrorState
                variant="dialog"
                visual={<ErrorIcon icon={WifiOff} tone="wait" />}
                title={t('err_network_title')}
                lines={[t('err_network_body'), t('err_network_auto')]}
                status={
                    <p className="text-muted-foreground mb-5 flex items-center justify-center gap-2 text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                        {t('err_network_retrying')}
                    </p>
                }
                actions={
                    <Button className="w-full" disabled={connection.checking} onClick={connection.retry}>
                        {t('retry')}
                    </Button>
                }
            />
            <LiveRegion text={spoken} />
        </>
    );
}

function RateLimitBody() {
    const t = useT();
    return <WaitBody icon={Hourglass} tone="wait" title={t('err_throttle_title')} line={t('err_throttle_body')} />;
}

function MaintenanceBody() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const retryAfter = useAppErrorStore((s) => s.retryAfter);
    const line =
        retryAfter === null ? t('err_maintenance_later') : t('err_maintenance_body').replace('{n}', formatNumber(Math.ceil(retryAfter / 60), lang));

    return <WaitBody icon={Wrench} tone="info" title={t('err_maintenance_title')} line={line} />;
}

interface WaitBodyProps {
    icon: LucideIcon;
    tone: 'wait' | 'info';
    title: string;
    line: string;
}

// Rate limit and maintenance: a ring counts down the server's Retry-After; without one, the plain icon and Retry at once
function WaitBody({ icon, tone, title, line }: WaitBodyProps) {
    const t = useT();
    const retryAfter = useAppErrorStore((s) => s.retryAfter);
    const { left, done } = useCountdown(retryAfter);
    const counted = retryAfter !== null;

    const visual = counted ? (
        <CountdownRing
            progress={elapsedShare(left, retryAfter)}
            label={done ? t('err_ready') : clock(left)}
            toneClass={done ? RING_TONE.ready : RING_TONE[tone]}
            icon={icon}
        />
    ) : (
        <ErrorIcon icon={icon} tone={tone} />
    );

    return (
        <>
            <ErrorState
                variant="dialog"
                visual={visual}
                title={title}
                lines={[line]}
                actions={
                    <Button className="w-full" disabled={!done} onClick={() => retryFailedQueries()}>
                        {t('retry')}
                    </Button>
                }
            />
            <LiveRegion text={counted && done ? t('err_ready_spoken') : ''} />
        </>
    );
}
