import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';

type Tick = 'done' | 'skipped' | 'current' | 'rejected' | 'waiting';

const TICK_CLASS: Record<Tick, string> = {
    done: 'bg-emerald-500',
    skipped: 'bg-amber-500/70',
    current: 'bg-brand',
    rejected: 'bg-destructive',
    waiting: 'bg-border',
};

/** One tick per approval step, by position: the same colours the decision dialog's step dots use. */
function ticksOf(request: ServiceRequest): Tick[] {
    const rungs = (request.approvals ?? []).filter((a) => a.kind === 'approval');
    const settled = request.status === 'approved' || request.status === 'completed';

    if (rungs.length > 0) {
        return rungs.map((rung) => {
            if (rung.status === 'skipped') return 'skipped';
            if (rung.status === 'approved' || settled) return 'done';
            if (rung.status === 'rejected') return 'rejected';
            if (rung.status === 'current' && request.status === 'pending') return 'current';
            return 'waiting';
        });
    }

    // No rows on the record: fall back to the done/total counters.
    const { done, total } = request.progress;
    return Array.from({ length: Math.max(total, 1) }, (_, i): Tick => {
        if (settled || i < done) return 'done';
        if (i !== done) return 'waiting';
        if (request.status === 'rejected') return 'rejected';
        return request.status === 'pending' ? 'current' : 'waiting';
    });
}

/**
 * Compact chain progress for table rows. The track is a fixed width shared by the steps,
 * so a long chain gets thinner ticks rather than a longer bar; the count keeps a fixed width too.
 */
export function WorkflowMini({ request }: { request: ServiceRequest }) {
    const ticks = ticksOf(request);
    const rejected = request.status === 'rejected';
    const cancelled = request.status === 'cancelled';
    const resolved = ticks.filter((tick) => tick === 'done' || tick === 'skipped').length;

    const label = rejected || cancelled ? '—' : `${resolved}/${ticks.length}`;

    return (
        <div className="flex items-center gap-1.5">
            <div className="flex w-24 shrink-0 items-center gap-[3px]">
                {ticks.map((tick, i) => (
                    <span key={i} className={cn('h-[5px] min-w-[2px] flex-1 rounded-full', TICK_CLASS[tick])} />
                ))}
            </div>
            <span className={cn('w-8 shrink-0 text-right font-mono text-xs tabular-nums', rejected ? 'text-destructive' : 'text-muted-foreground')}>
                {label}
            </span>
        </div>
    );
}
