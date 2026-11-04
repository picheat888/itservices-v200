// Gear menu for the TV's language, mode, sound and (on the board) page rotation. The gear shows on pointer, touch or key, then hides after 3 s.
import { usePresence } from '@/shared/hooks/use-presence';
import { cn } from '@/shared/lib/utils';
import { Settings } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useMonitorPrefs, useMonitorT } from '../hooks/use-monitor-prefs';

const IDLE_MS = 3000;

type Choice<V> = [V, string];

interface Props {
    className?: string;
    /** Board only: page rotation on/off */
    paused?: boolean;
    onPausedChange?: (paused: boolean) => void;
}

export function MonitorMenu({ className, paused, onPausedChange }: Props) {
    const t = useMonitorT();
    const prefs = useMonitorPrefs();
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const { mounted, closing } = usePresence(open);
    const [awake, setAwake] = useState(false);
    const [hovered, setHovered] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const gearRef = useRef<HTMLButtonElement>(null);

    // Wake on any pointer movement, tap or key; sleep after 3 s without one
    useEffect(() => {
        let timer = 0;
        const wake = () => {
            setAwake(true);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setAwake(false), IDLE_MS);
        };
        const events = ['pointermove', 'pointerdown', 'keydown'] as const;
        events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
        return () => {
            events.forEach((name) => window.removeEventListener(name, wake));
            window.clearTimeout(timer);
        };
    }, []);

    // Esc or a press outside closes the menu
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
            gearRef.current?.focus();
        };
        const onPointer = (e: PointerEvent) => {
            if (e.target instanceof Node && !wrapRef.current?.contains(e.target)) setOpen(false);
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('pointerdown', onPointer);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    const shown = awake || hovered || open;

    return (
        <div ref={wrapRef} className={cn('relative', className)} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <button
                ref={gearRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={t('mon_settings')}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                className={cn(
                    'bg-card text-foreground hover:bg-muted grid size-14 place-items-center rounded-[14px] border-2 transition-[opacity,translate] motion-reduce:transition-none',
                    'focus-visible:opacity-100 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400',
                    shown
                        ? 'translate-x-0 opacity-100 duration-(--motion-open) ease-(--ease-enter)'
                        : 'translate-x-3 opacity-0 duration-(--motion-close) ease-(--ease-exit) focus-visible:translate-x-0',
                )}
            >
                <Settings className="size-7" aria-hidden />
            </button>

            {mounted && (
                <div
                    id={menuId}
                    role="dialog"
                    aria-label={t('mon_settings')}
                    className={cn(
                        'bg-card absolute top-[70px] right-0 z-10 flex w-[460px] origin-top-right flex-col gap-4.5 rounded-[18px] border px-6 py-5.5 shadow-2xl',
                        closing ? 'motion-pop-out' : 'motion-pop-in',
                    )}
                >
                    <Row label={t('mon_lang')}>
                        <Chips
                            label={t('mon_lang')}
                            value={prefs.lang}
                            choices={[
                                ['th', t('mon_lang_th')],
                                ['en', t('mon_lang_en')],
                            ]}
                            onPick={(lang) => prefs.set({ lang })}
                        />
                    </Row>
                    <Row label={t('mon_mode')}>
                        <Chips
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
                        <Chips
                            label={t('mon_sound')}
                            value={prefs.sound}
                            choices={[
                                [true, t('mon_on')],
                                [false, t('mon_off')],
                            ]}
                            onPick={(sound) => prefs.set({ sound })}
                        />
                    </Row>
                    {onPausedChange && (
                        <Row label={t('mon_rotate')}>
                            <Chips
                                label={t('mon_rotate')}
                                value={!paused}
                                choices={[
                                    [true, t('mon_rotate_on')],
                                    [false, t('mon_rotate_off')],
                                ]}
                                onPick={(rotating) => onPausedChange(!rotating)}
                            />
                        </Row>
                    )}
                    <p className="text-muted-foreground m-0 text-[17px]">{t('mon_prefs_note')}</p>
                </div>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
            <span className="text-muted-foreground text-[22px]">{label}</span>
            {children}
        </div>
    );
}

function Chips<V extends string | boolean>({
    label,
    value,
    choices,
    onPick,
}: {
    label: string;
    value: V;
    choices: Choice<V>[];
    onPick: (value: V) => void;
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
                        choice === value ? 'bg-foreground text-background' : 'text-foreground hover:bg-background',
                    )}
                >
                    {text}
                </button>
            ))}
        </div>
    );
}
