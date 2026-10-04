/**
 * One headline number on a report page: label, value, optional unit, a footer line, and
 * optionally a meter against a goal (the SLA rate — bar with the goal marked, as in the design)
 * or a plain stacked `bar` (a share of the whole, or how the number splits).
 */
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';

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
}: {
    label: string;
    /** Shown on hover over the label — what a plain-worded figure really measures. */
    hint?: string;
    badge?: React.ReactNode;
    value: string;
    unit?: string;
    footer?: React.ReactNode;
    alert?: boolean;
    /** Percent value against a percent goal; green once it reaches the goal, red below it (as every SLA bar). */
    meter?: { value: number; goal: number };
    /** Stacked pieces as percents of the track, each with its fill class. */
    bar?: { key: string; percent: number; className: string; title?: string }[];
}) {
    return (
        <Card className={cn('flex min-w-0 flex-col gap-1.5 p-4', alert && 'border-amber-500/50')}>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
                <span className="truncate" title={hint}>
                    {label}
                </span>
                {badge}
            </div>
            <div className="font-mono text-2xl font-bold">
                {value}
                {unit && <span className="text-muted-foreground ml-1 text-sm font-medium">{unit}</span>}
            </div>
            {meter && (
                <div className="bg-muted relative h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                    <div
                        className={cn('h-full rounded-full', meter.value >= meter.goal ? 'bg-emerald-500' : 'bg-red-500')}
                        style={{ width: `${Math.min(100, Math.max(0, meter.value))}%` }}
                    />
                    <div className="bg-foreground/60 absolute inset-y-0 w-0.5" style={{ left: `${meter.goal}%` }} />
                </div>
            )}
            {bar && (
                <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
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
            {footer && <div className="text-muted-foreground text-xs">{footer}</div>}
        </Card>
    );
}
