// Settings → Ticket & SLA: the tab's small parts (summary card, clock and day pickers, number field, error list, section head).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { AlertCircle, CornerDownRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { TicketSlaClock } from '../api/settingsApi';
import { SegmentedRadio } from './segmented-radio';
import { useNumberFormat } from '@/shared/hooks/use-number-format';

export const SLA_LABEL = 'mb-1.5 block text-sm leading-none font-medium';
export const SLA_ERROR_BORDER = 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25';

/** Scrolls to an element on this tab and focuses it, without touching the URL. */
export function jumpTo(id: string, block: ScrollLogicalPosition = 'center') {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block, behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
}

function JumpLink({ to, block, className, children }: { to: string; block?: ScrollLogicalPosition; className?: string; children: ReactNode }) {
    return (
        <a
            href={`#${to}`}
            className={className}
            onClick={(e) => {
                e.preventDefault();
                jumpTo(to, block);
            }}
        >
            {children}
        </a>
    );
}

export function FieldError({ id, message }: { id?: string; message: string }) {
    if (!message) return null;
    return (
        <p id={id} className="text-destructive mt-1 flex items-center gap-1.5 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {message}
        </p>
    );
}

export function SectionHead({ id, title, desc, aside }: { id: string; title: string; desc: string; aside?: string }) {
    return (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
                <h3 id={id} className="text-base font-semibold">
                    {title}
                </h3>
                <p className="text-muted-foreground text-sm">{desc}</p>
            </div>
            {aside && (
                <span className="bg-muted text-muted-foreground border-border rounded-full border px-2.5 py-px text-xs font-semibold whitespace-nowrap">
                    {aside}
                </span>
            )}
        </div>
    );
}

/** Whole-number input with its unit and the "≈ days" hint on the same line. */
export function NumberField({
    id,
    value,
    onChange,
    unit,
    hint,
    min = 1,
    max,
    error,
    ariaLabel,
}: {
    id: string;
    value: number;
    onChange: (value: number) => void;
    unit: string;
    hint?: string;
    min?: number;
    max: number;
    error?: string;
    ariaLabel?: string;
}) {
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    value={Number.isFinite(value) ? value : ''}
                    onChange={(e) => onChange(e.target.valueAsNumber)}
                    aria-label={ariaLabel}
                    aria-invalid={!!error || undefined}
                    aria-describedby={describedBy}
                    className={cn('w-22 text-right tabular-nums', error && SLA_ERROR_BORDER)}
                />
                <span className="text-muted-foreground text-sm">{unit}</span>
                {hint && (
                    <span id={hintId} className="text-muted-foreground text-xs">
                        {hint}
                    </span>
                )}
            </div>
            <FieldError id={errorId} message={error ?? ''} />
        </div>
    );
}

/** Two-way choice: count working hours only, or round the clock. */
export function ClockToggle({
    name,
    value,
    onChange,
    legend,
}: {
    name: string;
    value: TicketSlaClock;
    onChange: (clock: TicketSlaClock) => void;
    legend: string;
}) {
    const t = useT();
    return (
        <SegmentedRadio<TicketSlaClock>
            name={name}
            legend={legend}
            value={value}
            onChange={onChange}
            options={[
                { value: 'business', label: t('set_sla_clock_business') },
                { value: 'calendar', label: t('set_sla_clock_calendar') },
            ]}
        />
    );
}

const WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

/** Working days as tick boxes (ISO 1 = Monday … 7 = Sunday). */
export function DayPicker({ id, days, onToggle, error }: { id: string; days: number[]; onToggle: (day: number) => void; error: string }) {
    const t = useT();
    const errorId = `${id}-error`;
    return (
        <fieldset id={id} tabIndex={-1} aria-describedby={error ? errorId : undefined} className="m-0 min-w-0 border-0 p-0 focus:outline-none">
            <legend className={cn(SLA_LABEL, 'p-0')}>{t('set_sla_days')}</legend>
            <div className="flex flex-wrap gap-1.5">
                {WEEK.map((day) => (
                    <label key={day} className="relative">
                        <input
                            type="checkbox"
                            checked={days.includes(day)}
                            onChange={() => onToggle(day)}
                            aria-label={t(`set_sla_day_full_${day}`)}
                            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                        />
                        <span
                            aria-hidden
                            className={cn(
                                'border-input bg-background text-muted-foreground peer-hover:border-brand/50 flex h-10 w-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                                'peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:text-brand-ink',
                                'peer-focus-visible:outline-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                                error && 'border-destructive',
                            )}
                        >
                            {t(`set_sla_day_${day}`)}
                        </span>
                    </label>
                ))}
            </div>
            <FieldError id={errorId} message={error} />
        </fieldset>
    );
}

export interface SlaError {
    id: string;
    where: string;
    message: string;
}

/** Errors found on Save, each linking to its field; re-keyed per attempt so it shakes and takes focus again. */
export function ErrorSummary({ errors, attempt }: { errors: SlaError[]; attempt: number }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (attempt > 0) ref.current?.focus();
    }, [attempt]);

    return (
        <div
            ref={ref}
            tabIndex={-1}
            role="alert"
            className="bg-destructive/10 dark:text-destructive border-destructive/25 animate-shake mb-4 scroll-mt-4 rounded-lg border px-3 py-2 text-sm text-red-700 focus:outline-none"
        >
            <p className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {t('set_sla_errors_title').replace('{n}', fmtN(errors.length))}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-10">
                {errors.map((e) => (
                    <li key={e.id}>
                        <JumpLink to={e.id} className="font-semibold underline underline-offset-2">
                            {e.where}
                        </JumpLink>
                        : {e.message}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export interface SlaSummaryValues {
    days: string;
    window: string;
    breakText: string;
    response: string;
    responseHint: string;
    priority: string;
    repair: string;
    request: string;
    goal: string;
    hoursErrors: number;
    responseErrors: number;
    closeErrors: number;
    goalErrors: number;
}

const CELL = 'text-foreground hover:bg-background flex min-w-0 flex-col gap-px rounded-lg px-2.5 py-2 transition-colors';
const LINE = 'text-foreground hover:bg-background -mx-2 flex min-h-7 items-center justify-between gap-2 rounded-md px-2 transition-colors';

function FixBadge({ count }: { count: number }) {
    const t = useT();
    const fmtN = useNumberFormat();
    if (count === 0) return null;
    return (
        <span className="bg-destructive/10 dark:text-destructive w-max rounded-full px-2 text-xs font-semibold text-red-700">
            {count > 1 ? t('set_sla_fix_n').replace('{n}', fmtN(count)) : t('set_sla_fix')}
        </span>
    );
}

/** Summary of every target on the tab; each cell jumps to its section. */
export function SlaSummary({ values }: { values: SlaSummaryValues }) {
    const t = useT();
    const v = values;
    return (
        <nav aria-labelledby="sla-summary-title" className="bg-muted/40 border-border rounded-xl border">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pt-2.5">
                <span id="sla-summary-title" className="text-sm font-semibold">
                    {t('set_sla_summary')}
                </span>
                <span className="text-muted-foreground text-xs">{t('set_sla_summary_hint')}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.9fr)_minmax(0,0.8fr)]">
                <JumpLink to="sla-sec-hours" block="start" className={CELL}>
                    <span className="text-muted-foreground text-xs font-semibold">{t('set_sla_clock_business')}</span>
                    <span className="text-base font-bold tabular-nums">
                        {v.days} {v.window}
                    </span>
                    <span className="text-muted-foreground text-xs">{v.breakText}</span>
                    <FixBadge count={v.hoursErrors} />
                </JumpLink>
                <JumpLink to="sla-resp" className={cn(CELL, 'border-border rounded-l-none border-l')}>
                    <span className="text-muted-foreground text-xs font-semibold">{t('set_sla_response_within')}</span>
                    <span className="text-base font-bold tabular-nums">{v.response}</span>
                    <span className="text-muted-foreground text-xs">{v.responseHint}</span>
                    <FixBadge count={v.responseErrors} />
                </JumpLink>
                <div
                    className={cn(
                        'border-border col-span-2 flex min-w-0 flex-col gap-px border-t px-2.5 py-2',
                        '@2xl:col-span-1 @2xl:border-t-0 @2xl:border-l',
                    )}
                >
                    <span className="text-muted-foreground text-xs font-semibold">{t('set_sla_resolve_within')}</span>
                    <JumpLink to="sla-sec-priority" block="start" className={LINE}>
                        <span className="min-w-0">{t('set_sla_sum_reported')}</span>
                        <b className="whitespace-nowrap tabular-nums">{v.priority}</b>
                    </JumpLink>
                    <JumpLink to="sla-sec-repair" block="start" className={LINE}>
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1 pl-2.5">
                            <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {t('set_sla_sum_repair')}
                        </span>
                        <b className="whitespace-nowrap tabular-nums">{v.repair}</b>
                    </JumpLink>
                    <JumpLink to="sla-sec-request" block="start" className={LINE}>
                        <span className="min-w-0">{t('set_sla_sum_request')}</span>
                        <b className="whitespace-nowrap tabular-nums">{v.request}</b>
                    </JumpLink>
                    <FixBadge count={v.closeErrors} />
                </div>
                <JumpLink
                    to="sla-goal"
                    className={cn(
                        CELL,
                        'border-border col-span-2 rounded-t-none border-t',
                        '@2xl:col-span-1 @2xl:rounded-lg @2xl:rounded-l-none @2xl:border-t-0 @2xl:border-l',
                    )}
                >
                    <span className="text-muted-foreground text-xs font-semibold">{t('set_sla_goal')}</span>
                    <span className="text-base font-bold tabular-nums">{v.goal}</span>
                    <span className="text-muted-foreground text-xs">{t('set_sla_goal_sub')}</span>
                    <FixBadge count={v.goalErrors} />
                </JumpLink>
            </div>
        </nav>
    );
}

/** The working window on a 24-hour bar, the break hatched out. */
export function WorkdayBar({ start, end, breakStart, breakEnd }: { start: number; end: number; breakStart: number | null; breakEnd: number | null }) {
    const pct = (minutes: number) => `${(Math.max(0, Math.min(1440, minutes)) / 1440) * 100}%`;
    return (
        <div aria-hidden>
            <div className="bg-muted border-border relative h-5 overflow-hidden rounded-md border">
                <div className="bg-brand/85 absolute inset-y-0" style={{ left: pct(start), width: pct(Math.max(0, end - start)) }} />
                {breakStart !== null && breakEnd !== null && breakEnd > breakStart && (
                    <div
                        className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--card)_0_4px,var(--muted)_4px_8px)]"
                        style={{ left: pct(breakStart), width: pct(breakEnd - breakStart) }}
                    />
                )}
            </div>
            <div className="text-muted-foreground mt-0.5 flex justify-between text-xs tabular-nums">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>24</span>
            </div>
        </div>
    );
}
