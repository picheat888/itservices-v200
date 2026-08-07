import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';

/**
 * Compact chain progress for table rows: one tick per approval step —
 * done = green, the step being waited on = brand, a rejected chain marks the
 * failing step red. Deliberately carries no SLA signal; how long a step has
 * been open is not treated as an indicator in this module.
 *
 * The track is a FIXED width and the steps divide it between them, so a
 * three-step chain and a five-step chain occupy exactly the same space in the
 * column — the segments get thinner instead of the bar getting longer. Ticks of a
 * fixed width made every row a different length, which read as "this request has
 * more progress" when it only meant "this workflow has more steps".
 *
 * The count keeps a fixed width too (right-aligned, tabular figures), so the
 * numbers line up down the column instead of shifting with the digit count.
 */
export function WorkflowMini({ request }: { request: ServiceRequest }) {
    const { progress, status } = request;
    const total = Math.max(progress.total, 1);
    const rejected = status === 'rejected';
    const cancelled = status === 'cancelled';
    const settled = status === 'approved' || status === 'fulfilled';

    const label = rejected || cancelled ? '—' : `${Math.min(progress.done, total)}/${total}`;

    return (
        <div className="flex items-center gap-1.5">
            <div className="flex w-24 shrink-0 items-center gap-[3px]">
                {Array.from({ length: total }).map((_, i) => (
                    <span
                        key={i}
                        className={cn(
                            // flex-1 + a floor of 2px: the segments share the track evenly,
                            // and a long chain still shows every step rather than collapsing.
                            'h-[5px] min-w-[2px] flex-1 rounded-full',
                            settled || i < progress.done
                                ? 'bg-emerald-500'
                                : rejected && i === progress.done
                                  ? 'bg-destructive'
                                  : !rejected && !cancelled && i === progress.done && status === 'pending'
                                    ? 'bg-brand'
                                    : 'bg-border',
                        )}
                    />
                ))}
            </div>
            <span className={cn('w-8 shrink-0 text-right font-mono text-xs tabular-nums', rejected ? 'text-destructive' : 'text-muted-foreground')}>
                {label}
            </span>
        </div>
    );
}
