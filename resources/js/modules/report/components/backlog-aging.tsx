/**
 * Age of the open-ticket backlog as four columns, fresh (green) to stale (red): each a full-height
 * track filled from the bottom by its share of the biggest bucket, the count above, the age under.
 * The tracks take whatever height the card is given (flex-1), so a card stretched to its row reads
 * as a taller chart, not as empty space. Used by pages/ticket-overview.tsx.
 */
import { useT } from '@/lang';
import type { TicketOverviewSummary } from '../types';

const BUCKETS = [
    { key: 'd1', label: 'rep_aging_d1', fill: 'bg-emerald-500' },
    { key: 'd3', label: 'rep_aging_d3', fill: 'bg-brand' },
    { key: 'd7', label: 'rep_aging_d7', fill: 'bg-amber-500' },
    { key: 'older', label: 'rep_aging_older', fill: 'bg-red-500' },
] as const;

export function BacklogAging({ aging }: { aging: TicketOverviewSummary['backlog']['aging'] }) {
    const t = useT();
    const max = Math.max(1, ...BUCKETS.map((b) => aging[b.key]));

    return (
        <div className="grid flex-1 grid-cols-4 gap-3 px-5 pt-3 pb-4">
            {BUCKETS.map((b) => {
                const count = aging[b.key];
                return (
                    <div key={b.key} className="flex min-w-0 flex-col items-center gap-1.5">
                        <b className="font-mono text-lg leading-none">{count}</b>
                        <div className="bg-muted relative flex min-h-16 w-full max-w-14 flex-1 flex-col justify-end overflow-hidden rounded-md">
                            {/* Height is the data, so it cannot be a fixed class (as horizontal-bars.tsx does for width). */}
                            {count > 0 && <span className={`block w-full rounded-md ${b.fill}`} style={{ height: `${(count / max) * 100}%` }} />}
                        </div>
                        <span className="text-muted-foreground w-full truncate text-center text-xs" title={t(b.label)}>
                            {t(b.label)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
