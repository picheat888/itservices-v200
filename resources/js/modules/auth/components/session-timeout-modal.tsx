import { useT } from '@/lang';
import { clock, crossedAnnouncement, spokenTime, toneFor, type WarnTone } from '@/modules/auth/lib/session-warning';
import { BlockingDialog } from '@/shared/components/blocking-dialog';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
    secondsLeft: number;
    /** How long the warning runs in total; the ring fills over this. */
    warnSeconds: number;
    onStay: () => void;
    onLogout: () => void;
}

const TONE_CLASS: Record<WarnTone, string> = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
};

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Time left in words for a screen reader, e.g. "เหลือเวลาอีก 1 นาที 15 วินาที". */
function spokenLeft(t: ReturnType<typeof useT>, seconds: number): string {
    const lang = useUiStore.getState().lang;
    const words = {
        minutes: (n: number) => (n === 1 ? t('session_one_minute') : t('login_time_minutes').replace('{n}', formatNumber(n, lang))),
        seconds: (n: number) => (n === 1 ? t('session_one_second') : t('login_time_seconds').replace('{n}', formatNumber(n, lang))),
    };
    return t('session_time_left').replace('{time}', spokenTime(seconds, words));
}

// Idle warning with a countdown: stay signed in or sign out now. Its own top layer, so it works over any open dialog.
export function SessionTimeoutModal({ secondsLeft, warnSeconds, onStay, onLogout }: Props) {
    const t = useT();

    // Read with the description when the dialog opens; later milestones go to the live region
    const [openingTime] = useState(() => spokenLeft(t, secondsLeft));
    const [announcement, setAnnouncement] = useState('');
    const previous = useRef(secondsLeft);
    useEffect(() => {
        const milestone = crossedAnnouncement(previous.current, secondsLeft);
        previous.current = secondsLeft;
        if (milestone !== null) setAnnouncement(spokenLeft(t, secondsLeft));
    }, [secondsLeft, t]);

    const progress = warnSeconds > 0 ? Math.max(0, Math.min(1, (warnSeconds - secondsLeft) / warnSeconds)) : 1;
    const tone = TONE_CLASS[toneFor(secondsLeft, warnSeconds)];

    return (
        <BlockingDialog layer="top">
            <div className="p-6">
                <div className="mb-4 flex justify-center" aria-hidden>
                    <div className="relative flex h-24 w-24 items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                            <circle cx="44" cy="44" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
                            <circle
                                cx="44"
                                cy="44"
                                r={RADIUS}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                                className={cn(tone, 'transition-[stroke-dashoffset,color] duration-1000 ease-linear motion-reduce:transition-none')}
                            />
                        </svg>
                        <div className="z-10 flex flex-col items-center">
                            <Clock className="text-muted-foreground mb-0.5 h-4 w-4" />
                            <span className={cn('text-2xl leading-none font-bold tabular-nums', tone)}>{clock(secondsLeft)}</span>
                        </div>
                    </div>
                </div>

                <DialogTitle className="mb-1 text-center text-base leading-normal font-semibold tracking-normal">
                    {t('session_expiring_title')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mb-5 text-center text-sm whitespace-pre-line">
                    {t('session_expiring_desc')}
                    <span className="sr-only"> {openingTime}</span>
                </DialogDescription>
                <span role="status" aria-live="polite" className="sr-only">
                    {announcement}
                </span>

                <div className="flex flex-col gap-2">
                    <Button className="w-full" onClick={onStay}>
                        {t('session_stay')}
                    </Button>
                    <Button variant="ghost" className="text-muted-foreground w-full" onClick={onLogout}>
                        {t('profile_signout')}
                    </Button>
                </div>
            </div>
        </BlockingDialog>
    );
}
