import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';

/**
 * Compact chain progress for table rows: one tick per approval step —
 * done = green, the step being waited on = brand, a rejected chain marks the
 * failing step red. Deliberately carries no SLA signal; how long a step has
 * been open is not treated as an indicator in this module.
 */
export function WorkflowMini({ request }: { request: ServiceRequest }) {
    const { progress, status } = request;
    const total = Math.max(progress.total, 1);
    const rejected = status === 'rejected';
    const cancelled = status === 'cancelled';
    const settled = status === 'approved' || status === 'fulfilled';

    const label = rejected || cancelled ? '—' : `${Math.min(progress.done, total)}/${total}`;

    return (
        <div className="flex items-center gap-[3px]">
            {Array.from({ length: total }).map((_, i) => (
                <span
                    key={i}
                    className={cn(
                        'h-[5px] w-5 rounded-full',
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
            <span className={cn('ml-1.5 font-mono text-xs', rejected ? 'text-destructive' : 'text-muted-foreground')}>{label}</span>
        </div>
    );
}
