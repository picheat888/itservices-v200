// Sample ticket on the login brand panel: it walks open, in progress, completed once, then rests.
// The walk ends in under 5 seconds, so it needs no pause control (WCAG 2.2.2); reduced motion shows the end at once.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

const TICKET_NO = 'TKT-NW-261020-014';
const STEP_MS = 1400;

const STEPS = [
    { status: 'ticket_open', tone: 'blue', dot: 'bg-blue-500 ring-blue-500/15', at: '2026-10-20 08:42', note: 'login_sample_reported' },
    { status: 'ticket_in_progress', tone: 'violet', dot: 'bg-violet-500 ring-violet-500/15', at: '2026-10-20 08:55', note: 'login_sample_taken' },
    { status: 'ticket_completed', tone: 'green', dot: 'bg-emerald-500 ring-emerald-500/15', at: '2026-10-20 09:20', note: 'login_sample_closed' },
] as const;

export function SampleTicketCard() {
    const t = useT();
    const fmt = useDateFormat();
    const [reached, setReached] = useState(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? STEPS.length : 1));

    useEffect(() => {
        if (reached >= STEPS.length) return;
        const id = setTimeout(() => setReached((n) => n + 1), STEP_MS);
        return () => clearTimeout(id);
    }, [reached]);

    const current = STEPS[reached - 1];

    return (
        <div
            aria-hidden
            className="bg-card text-card-foreground grid w-full max-w-[470px] gap-3.5 rounded-[18px] px-[22px] pt-5 pb-[22px] shadow-[0_20px_50px_rgb(8_25_70/0.24)] dark:bg-[color-mix(in_oklab,var(--brand)_12%,hsl(222_24%_15%))] dark:shadow-[0_24px_60px_rgb(0_0_0/0.4)]"
        >
            <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-[13px] font-semibold tabular-nums">{TICKET_NO}</span>
                <StatusBadge tone={current.tone}>{t(current.status)}</StatusBadge>
            </div>
            <div>
                <p className="text-[17px] leading-snug font-semibold">{t('login_sample_title')}</p>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[13px]">
                    <Wifi className="size-3.5" aria-hidden />
                    {t('ticket_cat_network')}
                </p>
            </div>

            {/* Status timeline */}
            <ol className="border-border grid border-t pt-4 dark:border-white/10">
                {STEPS.map((step, i) => {
                    const done = i < reached;
                    const now = i === reached - 1;
                    const last = i === STEPS.length - 1;
                    return (
                        <li key={step.status} className={cn('relative grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-2.5', !last && 'pb-3.5')}>
                            <span
                                className={cn(
                                    'col-start-1 row-start-1 size-2.5 place-self-center rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-200',
                                    now
                                        ? cn(step.dot, 'border-transparent ring-4')
                                        : done
                                          ? 'bg-muted-foreground border-muted-foreground'
                                          : 'bg-card border-border',
                                )}
                            />
                            {!last && (
                                <span className="bg-border absolute top-[19px] -bottom-px left-[9px] w-0.5 overflow-hidden rounded-full dark:bg-white/10">
                                    <span
                                        className={cn(
                                            'bg-muted-foreground block h-full origin-top transition-transform duration-700 ease-out',
                                            i + 1 < reached ? 'scale-y-100' : 'scale-y-0',
                                        )}
                                    />
                                </span>
                            )}
                            <span
                                className={cn(
                                    'col-start-2 row-start-1 text-sm leading-5 font-semibold transition-colors',
                                    done ? 'text-card-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {t(step.status)}
                            </span>
                            <span
                                className={cn(
                                    'text-muted-foreground col-start-3 row-start-1 text-[13px] leading-5 tabular-nums transition-opacity',
                                    done ? 'opacity-100' : 'opacity-0',
                                )}
                            >
                                {fmt.time(step.at)}
                            </span>
                            <span
                                className={cn(
                                    'text-muted-foreground col-span-2 col-start-2 row-start-2 text-[13px] leading-[18px] transition-opacity',
                                    done ? 'opacity-100' : 'opacity-0',
                                )}
                            >
                                {t(step.note)}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
