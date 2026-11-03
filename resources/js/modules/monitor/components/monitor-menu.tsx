// Gear menu for the TV's language, mode and sound. The gear shows while the mouse moves or it has focus, then hides after 3 s.
import { cn } from '@/shared/lib/utils';
import { Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMonitorPrefs, useMonitorT } from '../hooks/use-monitor-prefs';
import type { MonitorPrefs } from '../lib/monitor-prefs';

const IDLE_MS = 3000;

type Choice<K extends keyof MonitorPrefs> = [MonitorPrefs[K], string];

export function MonitorMenu({ className }: { className?: string }) {
    const t = useMonitorT();
    const prefs = useMonitorPrefs();
    const [open, setOpen] = useState(false);
    const [awake, setAwake] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const gearRef = useRef<HTMLButtonElement>(null);

    // Wake on mouse movement, sleep after 3 s still
    useEffect(() => {
        let timer = 0;
        const wake = () => {
            setAwake(true);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setAwake(false), IDLE_MS);
        };
        window.addEventListener('mousemove', wake);
        return () => {
            window.removeEventListener('mousemove', wake);
            window.clearTimeout(timer);
        };
    }, []);

    // Esc or a click outside closes the menu
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
            gearRef.current?.focus();
        };
        const onPointer = (e: PointerEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('pointerdown', onPointer);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    const shown = awake || open;

    return (
        <div ref={wrapRef} className={cn('relative', className)}>
            <button
                ref={gearRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={t('mon_settings')}
                aria-expanded={open}
                className={cn(
                    'bg-card text-foreground grid size-14 place-items-center rounded-[14px] border-2 transition-opacity duration-300 motion-reduce:transition-none',
                    'focus-visible:opacity-100 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400',
                    shown ? 'opacity-100' : 'opacity-0',
                )}
            >
                <Settings className="size-7" aria-hidden />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label={t('mon_settings')}
                    className="bg-card absolute top-[70px] right-0 z-10 flex w-[440px] flex-col gap-4.5 rounded-[18px] border px-6 py-5.5 shadow-2xl"
                >
                    <Row label={t('mon_lang')}>
                        <Chips<'lang'>
                            label={t('mon_lang')}
                            value={prefs.lang}
                            choices={[
                                ['th', 'ไทย'],
                                ['en', 'EN'],
                            ]}
                            onPick={(lang) => prefs.set({ lang })}
                        />
                    </Row>
                    <Row label={t('mon_mode')}>
                        <Chips<'theme'>
                            label={t('mon_mode')}
                            value={prefs.theme}
                            choices={[
                                ['dark', t('mon_dark')],
                                ['light', t('mon_light')],
                            ]}
                            onPick={(theme) => prefs.set({ theme })}
                        />
                    </Row>
                    <Row label={t('mon_sound')}>
                        <Chips<'sound'>
                            label={t('mon_sound')}
                            value={prefs.sound}
                            choices={[
                                [true, t('mon_on')],
                                [false, t('mon_off')],
                            ]}
                            onPick={(sound) => prefs.set({ sound })}
                        />
                    </Row>
                    <p className="text-muted-foreground m-0 text-[17px]">{t('mon_prefs_note')}</p>
                </div>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4">
            <span className="text-muted-foreground text-[22px]">{label}</span>
            {children}
        </div>
    );
}

function Chips<K extends keyof MonitorPrefs>({
    label,
    value,
    choices,
    onPick,
}: {
    label: string;
    value: MonitorPrefs[K];
    choices: Choice<K>[];
    onPick: (value: MonitorPrefs[K]) => void;
}) {
    return (
        <div role="group" aria-label={label} className="bg-muted grid grid-cols-2 gap-1.5 rounded-xl p-1.5">
            {choices.map(([choice, text]) => (
                <button
                    key={String(choice)}
                    type="button"
                    aria-pressed={choice === value}
                    onClick={() => onPick(choice)}
                    className={cn(
                        'h-12 rounded-[9px] text-[22px] font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400',
                        choice === value ? 'bg-foreground text-background' : 'text-foreground',
                    )}
                >
                    {text}
                </button>
            ))}
        </div>
    );
}
