import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { Clock } from 'lucide-react';

interface Props {
    secondsLeft: number;
    onStay: () => void;
    onLogout: () => void;
}

/**
 * Full-screen overlay shown when the inactivity timer is close to expiring.
 * Displays a live countdown and gives the user two actions:
 *   - Stay logged in  → resets the inactivity clock
 *   - Log out now     → logs out immediately
 */
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

    // Color transitions: green → amber → red
    const arcColor = secondsLeft > 60 ? '#22c55e' : secondsLeft > 30 ? '#f59e0b' : '#ef4444';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border">

                {/* Progress bar at top */}
                <div className="h-1 w-full bg-muted">
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
                                <Clock className="mb-0.5 h-4 w-4 text-muted-foreground" />
                                <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: arcColor }}>
                                    {timeDisplay}
                                </span>
                            </div>
                        </div>
                    </div>

                    <h2 className="mb-1 text-center text-base font-semibold">{t('session_expiring_title')}</h2>
                    <p className="mb-5 text-center text-sm text-muted-foreground">
                        {t('session_expiring_desc')}{' '}
                        <span className="font-medium" style={{ color: arcColor }}>
                            {timeDisplay}
                        </span>{' '}
                        {t('session_expiring_seconds')}
                    </p>

                    <div className="flex flex-col gap-2">
                        <Button className="w-full" onClick={onStay}>
                            {t('session_stay')}
                        </Button>
                        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onLogout}>
                            {t('session_logout_now')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
