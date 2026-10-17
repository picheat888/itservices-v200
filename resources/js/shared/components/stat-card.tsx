// The one KPI card of the app (module Overview tabs, Dashboard, reports): label + icon, the figure, an optional
// meter / split bar / small chart, one footer line; alert tints, loading at its real size, clickable as a whole.
import { slaLevel, type SlaLevel } from '@/shared/lib/sla-level';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

/** The value's ink per tone, a step darker in light mode as the reports' warning text. */
const VALUE_INK = {
    red: 'text-red-700 dark:text-red-400',
    amber: 'text-amber-800 dark:text-amber-300',
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-emerald-700 dark:text-emerald-400',
} as const;

/** A tile with work waiting: tinted card, coloured label, solid icon chip. */
const ALERT = {
    red: {
        card: 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30',
        label: 'font-semibold text-red-700 dark:text-red-400',
        chip: 'bg-red-500 text-white shadow-sm shadow-red-500/30',
    },
    amber: {
        card: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30',
        label: 'font-semibold text-amber-800 dark:text-amber-300',
        chip: 'bg-amber-400 text-amber-950 shadow-sm shadow-amber-500/30',
    },
} as const;

const METER_FILL: Record<SlaLevel, string> = { met: 'bg-emerald-500', near: 'bg-amber-500', miss: 'bg-red-500' };

/** A plain count reads with thousands separators; anything else is shown as given. */
function shown(value: ReactNode): ReactNode {
    if (typeof value === 'number') return value.toLocaleString('en-US');
    if (typeof value === 'string' && /^-?\d{4,}$/.test(value)) return Number(value).toLocaleString('en-US');
    return value;
}

export interface StatCardProps {
    label: string;
    value: ReactNode;
    unit?: string;
    /** Brand icon at the top right: a 36px chip on the default size, a bare glyph on the compact one. */
    icon?: LucideIcon;
    /** Beside the icon at the top right (a goal or status badge). */
    badge?: ReactNode;
    /** Beside the figure (a small chart). */
    aside?: ReactNode;
    /** Percent value against a percent goal: green at the goal, amber within 10 points, red further off. */
    meter?: { value: number; goal: number };
    /** Stacked pieces as percents of the track, each with its fill class. */
    bar?: { key: string; percent: number; className: string; title?: string }[];
    /** The line under the figure; on the default size it stays one line. */
    footer?: ReactNode;
    /** Older name of `footer`. */
    sub?: ReactNode;
    /** A small chart at the footer's right (a sparkline), hidden on a narrow tile. */
    side?: ReactNode;
    /** Fill class of a dot before the label: the figure's colour in the charts below. */
    dot?: string;
    /** Shown on hover over the label: what a plain-worded figure really measures. */
    hint?: string;
    /** Colours the value. */
    tone?: keyof typeof VALUE_INK;
    /** "red" for what has already gone wrong, "amber" (or true) for what needs watching. */
    alert?: boolean | 'amber' | 'red';
    loading?: boolean;
    /** Makes the whole card a button that opens what it counts. */
    onClick?: () => void;
    /** compact: the Dashboard and report rows (16px padding, 24px figure). */
    size?: 'default' | 'compact';
    className?: string;
}

export function StatCard({
    label,
    value,
    unit,
    icon: Icon,
    badge,
    aside,
    meter,
    bar,
    footer,
    sub,
    side,
    dot,
    hint,
    tone,
    alert,
    loading,
    onClick,
    size = 'default',
    className,
}: StatCardProps) {
    const compact = size === 'compact';
    const level = alert === true ? 'amber' : alert || null;
    const line = footer ?? sub;
    const onKeyDown = (e: KeyboardEvent) => {
        if (!onClick || e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onClick();
    };

    return (
        <Card
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onKeyDown}
            aria-busy={loading || undefined}
            className={cn(
                'flex min-w-0 flex-col transition-colors',
                compact ? 'gap-1.5 p-4' : 'p-5',
                level && ALERT[level].card,
                onClick && 'hover:border-brand/40 focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none',
                className,
            )}
        >
            {/* Label row */}
            <div className="flex items-start justify-between gap-2">
                <span className={cn('flex min-w-0 items-center gap-1.5 text-sm', level ? ALERT[level].label : 'text-muted-foreground')} title={hint}>
                    {dot && <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dot)} />}
                    <span className="truncate">{label}</span>
                </span>
                {(badge || Icon) && (
                    <span className="flex shrink-0 items-center gap-2">
                        {badge}
                        {Icon &&
                            (compact ? (
                                <Icon aria-hidden className="text-brand h-[18px] w-[18px]" />
                            ) : (
                                <span
                                    aria-hidden
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-lg',
                                        level ? ALERT[level].chip : 'bg-brand/10 text-brand',
                                    )}
                                >
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            ))}
                    </span>
                )}
            </div>

            {loading ? (
                <>
                    <Skeleton className={compact ? 'h-8 w-16' : 'mt-2 h-9 w-16'} />
                    {line !== undefined && <Skeleton className={cn('h-4 w-24', !compact && 'mt-1')} />}
                </>
            ) : (
                <>
                    {/* Figure */}
                    <div className={cn('flex items-end justify-between gap-3', !compact && 'mt-2')}>
                        <div className={cn('font-bold tabular-nums', compact ? 'text-2xl' : 'text-3xl', tone && VALUE_INK[tone])}>
                            {shown(value)}
                            {unit && <span className="text-muted-foreground ml-1 text-sm font-medium">{unit}</span>}
                        </div>
                        {aside}
                    </div>

                    {meter && (
                        <div
                            className={cn('dark:bg-muted relative h-1.5 overflow-hidden rounded-full bg-slate-200', !compact && 'mt-2')}
                            aria-hidden="true"
                        >
                            <div
                                className={cn('h-full rounded-full', METER_FILL[slaLevel(meter.value, meter.goal)])}
                                style={{ width: `${Math.min(100, Math.max(0, meter.value))}%` }}
                            />
                            <div className="bg-foreground/60 absolute inset-y-0 w-0.5" style={{ left: `${meter.goal}%` }} />
                        </div>
                    )}
                    {bar && (
                        <div className={cn('dark:bg-muted flex h-1.5 overflow-hidden rounded-full bg-slate-200', !compact && 'mt-2')}>
                            {bar.map((piece) => (
                                <span
                                    key={piece.key}
                                    title={piece.title}
                                    className={cn('block h-full', piece.className)}
                                    style={{ width: `${Math.min(100, Math.max(0, piece.percent))}%` }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Footer */}
                    {side ? (
                        <div className={cn('text-muted-foreground @container mt-auto text-xs', !compact && 'pt-1')}>
                            <div className="flex items-end justify-between gap-2">
                                <div className="min-w-0 flex-1">{line}</div>
                                <span className="hidden shrink-0 @[11.5rem]:inline-flex">{side}</span>
                            </div>
                        </div>
                    ) : (
                        line !== undefined &&
                        line !== null && <div className={cn('text-muted-foreground mt-auto text-xs', !compact && 'truncate pt-1')}>{line}</div>
                    )}
                </>
            )}
        </Card>
    );
}

/** Columns for a row of KPI cards: two, then all of them from 1024px. */
const ROW_COLUMNS: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 lg:grid-cols-5',
};

export const statGridClass = (count: number) => cn('grid', ROW_COLUMNS[count] ?? ROW_COLUMNS[4]);

/** A row of KPI cards: 16px apart on module pages, 12px on the denser Dashboard and report rows. */
export function StatGrid({ count, dense, className, children }: { count: number; dense?: boolean; className?: string; children: ReactNode }) {
    return <div className={cn(statGridClass(count), dense ? 'gap-3' : 'gap-4', className)}>{children}</div>;
}
