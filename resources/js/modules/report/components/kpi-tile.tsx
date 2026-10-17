/**
 * One headline number on a report page: label, value, optional unit, a footer line, and
 * optionally a meter against a goal (the SLA rate — bar with the goal marked, as in the design)
 * or a plain stacked `bar` (a share of the whole, or how the number splits).
 */
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import type { LucideIcon } from 'lucide-react';

/** The value's ink per tone, a step darker in light mode as the report's warning text. */
const VALUE_INK = {
    red: 'text-red-700 dark:text-red-400',
    amber: 'text-amber-800 dark:text-amber-300',
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-emerald-700 dark:text-emerald-400',
} as const;

/** SLA level against its goal: met, within 10 points, or further off (the Tickets overview's tiers). */
export type SlaLevel = 'met' | 'near' | 'miss';
export const slaLevel = (rate: number, goal: number): SlaLevel => (rate >= goal ? 'met' : rate >= goal - 10 ? 'near' : 'miss');
const METER_FILL: Record<SlaLevel, string> = { met: 'bg-emerald-500', near: 'bg-amber-500', miss: 'bg-red-500' };

export function KpiTile({
    label,
    hint,
    dot,
    tone,
    badge,
    value,
    unit,
    footer,
    side,
    alert,
    meter,
    bar,
    icon: Icon,
    className,
}: {
    label: string;
    /** Shown on hover over the label — what a plain-worded figure really measures. */
    hint?: string;
    /** Fill class of a dot before the label: the figure's colour in the charts below. */
    dot?: string;
    /** Colours the value. */
    tone?: keyof typeof VALUE_INK;
    badge?: React.ReactNode;
    value: React.ReactNode;
    unit?: string;
    footer?: React.ReactNode;
    /** A small chart at the footer's right (a sparkline), hidden on a narrow tile. */
    side?: React.ReactNode;
    /** Flags the tile with a tinted border: "red" for what has already gone wrong (below the goal,
     *  past SLA), "amber" (or true) for what needs watching (due soon, nobody assigned). */
    alert?: boolean | 'amber' | 'red';
    /** Percent value against a percent goal; green once it reaches the goal, red below it (as every SLA bar). */
    meter?: { value: number; goal: number };
    /** Stacked pieces as percents of the track, each with its fill class. */
    bar?: { key: string; percent: number; className: string; title?: string }[];
    /** Brand-coloured icon at the top right (Dashboard tiles). */
    icon?: LucideIcon;
    className?: string;
}) {
    return (
        <Card className={cn('flex min-w-0 flex-col gap-1.5 p-4', alert === 'red' ? 'border-red-500/50' : alert && 'border-amber-500/50', className)}>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
                {dot ? (
                    <span className="flex min-w-0 items-center gap-1.5" title={hint}>
                        <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dot)} />
                        <span className="truncate">{label}</span>
                    </span>
                ) : (
                    <span className="truncate" title={hint}>
                        {label}
                    </span>
                )}
                {Icon ? (
                    <span className="flex shrink-0 items-center gap-2">
                        {badge}
                        <Icon aria-hidden className="text-brand h-[18px] w-[18px]" />
                    </span>
                ) : (
                    badge
                )}
            </div>
            <div className={cn('text-2xl font-bold', tone && VALUE_INK[tone])}>
                {value}
                {unit && <span className="text-muted-foreground ml-1 text-sm font-medium">{unit}</span>}
            </div>
            {meter && (
                <div className="dark:bg-muted relative h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                        className={cn('h-full rounded-full', METER_FILL[slaLevel(meter.value, meter.goal)])}
                        style={{ width: `${Math.min(100, Math.max(0, meter.value))}%` }}
                    />
                    <div className="bg-foreground/60 absolute inset-y-0 w-0.5" style={{ left: `${meter.goal}%` }} />
                </div>
            )}
            {bar && (
                <div className="dark:bg-muted flex h-1.5 overflow-hidden rounded-full bg-slate-200">
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
            {side ? (
                // Chart hides on a narrow tile
                <div className="text-muted-foreground @container mt-auto text-xs">
                    <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0 flex-1">{footer}</div>
                        <span className="hidden shrink-0 @[11.5rem]:inline-flex">{side}</span>
                    </div>
                </div>
            ) : (
                footer && <div className="text-muted-foreground mt-auto text-xs">{footer}</div>
            )}
        </Card>
    );
}
