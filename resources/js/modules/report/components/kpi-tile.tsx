/**
 * One headline number on a report page: label, value, optional unit, a footer line, and
 * optionally a meter against a goal (the SLA rate — bar with the goal marked, as in the design)
 * or a plain stacked `bar` (a share of the whole, or how the number splits).
 */
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import type { LucideIcon } from 'lucide-react';

export function KpiTile({
    label,
    hint,
    badge,
    value,
    unit,
    footer,
    alert,
    meter,
    bar,
    icon: Icon,
    className,
}: {
    label: string;
    /** Shown on hover over the label — what a plain-worded figure really measures. */
    hint?: string;
    badge?: React.ReactNode;
    value: React.ReactNode;
    unit?: string;
    footer?: React.ReactNode;
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
                <span className="truncate" title={hint}>
                    {label}
                </span>
                {Icon ? (
                    <span className="flex shrink-0 items-center gap-2">
                        {badge}
                        <Icon aria-hidden className="text-brand h-[18px] w-[18px]" />
                    </span>
                ) : (
                    badge
                )}
            </div>
            <div className="text-2xl font-bold">
                {value}
                {unit && <span className="text-muted-foreground ml-1 text-sm font-medium">{unit}</span>}
            </div>
            {meter && (
                <div className="dark:bg-muted relative h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                        className={cn('h-full rounded-full', meter.value >= meter.goal ? 'bg-emerald-500' : 'bg-red-500')}
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
            {footer && <div className="text-muted-foreground mt-auto text-xs">{footer}</div>}
        </Card>
    );
}
