// One tap before the board: browsers only play sound after a gesture. Enter starts with sound.
import { Check, MonitorPlay, Volume2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useMonitorT } from '../hooks/use-monitor-prefs';

export function StartScreen({ justPaired, onStart }: { justPaired: boolean; onStart: (withSound: boolean) => void }) {
    const t = useMonitorT();
    const startRef = useRef<HTMLButtonElement>(null);

    useEffect(() => startRef.current?.focus(), []);

    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="bg-card flex w-[1040px] flex-col items-center gap-5.5 rounded-[28px] border px-18 py-16 text-center">
                <span
                    className={`grid size-24 place-items-center rounded-3xl ${justPaired ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}`}
                >
                    {justPaired ? <Check className="size-13" aria-hidden /> : <MonitorPlay className="size-13" aria-hidden />}
                </span>
                <h1 className="text-[56px] leading-[1.25] font-bold">{justPaired ? t('mon_paired_title') : t('mon_title')}</h1>
                <p className="text-muted-foreground max-w-[860px] text-[30px] leading-[1.6]">{t('mon_start_hint')}</p>
                <button
                    ref={startRef}
                    type="button"
                    onClick={() => onStart(true)}
                    className="bg-brand text-brand-foreground focus-visible:outline-foreground mt-4.5 inline-flex h-22 items-center gap-4 rounded-[18px] px-12 text-[32px] font-bold outline-4 outline-offset-4 outline-blue-300 dark:outline-blue-200"
                >
                    <Volume2 className="size-[34px]" aria-hidden />
                    {t('mon_start_sound')}
                </button>
                <span className="text-muted-foreground text-[24px]">{t('mon_start_enter')}</span>
                <button
                    type="button"
                    onClick={() => onStart(false)}
                    className="text-muted-foreground focus-visible:outline-foreground text-[24px] underline underline-offset-[6px] focus-visible:outline-2"
                >
                    {t('mon_start_silent')}
                </button>
            </div>
        </div>
    );
}
