import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Clock } from 'lucide-react';
import { BlockingDialog } from './blocking-dialog';

interface Props {
    secondsLeft: number;
    onStay: () => void;
    onLogout: () => void;
}

// Idle warning with a countdown: stay signed in or sign out now. Its own top layer, so it works over any open dialog.
export function SessionTimeoutModal({ secondsLeft, onStay, onLogout }: Props) {
    const t = useT();

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timeDisplay = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : String(secs);

    // Progress arc: 0 → full as countdown goes 120 → 0
    const MAX = 120;
    const progress = Math.max(0, Math.min(1, (MAX - secondsLeft) / MAX));
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);

    // Color transitions follow the design tokens: ok → warn → danger.
    const arcColor = secondsLeft > 60 ? '#059669' : secondsLeft > 30 ? '#d97706' : '#dc2626';

    return (
        <BlockingDialog layer="top">
            {/* Progress bar at top */}
            <div className="bg-muted h-1 w-full">
                <div
                    className="h-full transition-all duration-1000"
                    style={{
                        width: `${progress * 100}%`,
                        backgroundColor: arcColor,
                    }}
                />
            </div>

            <div className="p-6">
                {/* SVG countdown ring */}
                <div className="mb-4 flex justify-center">
                    <div className="relative flex h-24 w-24 items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                            {/* Track */}
                            <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
                            {/* Arc */}
                            <circle
                                cx="44"
                                cy="44"
                                r={radius}
                                fill="none"
                                stroke={arcColor}
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                            />
                        </svg>
                        <div className="z-10 flex flex-col items-center">
                            <Clock className="text-muted-foreground mb-0.5 h-4 w-4" />
                            <span className="text-2xl leading-none font-bold tabular-nums" style={{ color: arcColor }}>
                                {timeDisplay}
                            </span>
                        </div>
                    </div>
                </div>

                <DialogTitle className="mb-1 text-center text-base leading-normal font-semibold tracking-normal">
                    {t('session_expiring_title')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mb-5 text-center text-sm">
                    {t('session_expiring_desc')}{' '}
                    <span className="font-medium" style={{ color: arcColor }}>
                        {timeDisplay}
                    </span>{' '}
                    {t('session_expiring_seconds')}
                </DialogDescription>

                <div className="flex flex-col gap-2">
                    <Button className="w-full" onClick={onStay}>
                        {t('session_stay')}
                    </Button>
                    <Button variant="ghost" className="text-muted-foreground w-full" onClick={onLogout}>
                        {t('session_logout_now')}
                    </Button>
                </div>
            </div>
        </BlockingDialog>
    );
}
