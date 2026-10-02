/**
 * Age of the open-ticket backlog as four tinted tiles, fresh (green) to stale (red): a big count
 * over its age band, both in the tile's colour — the design's ".aging" tiles. Four across, two
 * by two on a phone. Used by pages/ticket-overview.tsx.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { TicketOverviewSummary } from '../types';

/** The same soft tints and text colours as StatusBadge's tones, so the hues read as one set. */
const BUCKETS = [
    { key: 'd1', label: 'rep_aging_d1', tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { key: 'd3', label: 'rep_aging_d3', tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { key: 'd7', label: 'rep_aging_d7', tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { key: 'older', label: 'rep_aging_older', tone: 'bg-red-500/10 text-red-600 dark:text-red-400' },
] as const;

export function BacklogAging({ aging }: { aging: TicketOverviewSummary['backlog']['aging'] }) {
    const t = useT();

    return (
        <div className="grid grid-cols-2 gap-2 px-5 pt-3.5 pb-4 sm:grid-cols-4">
            {BUCKETS.map((b) => (
                <div key={b.key} className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg p-2.5', b.tone)}>
                    <b className="font-mono text-xl leading-tight">{aging[b.key]}</b>
                    <span className="truncate text-xs" title={t(b.label)}>
                        {t(b.label)}
                    </span>
                </div>
            ))}
        </div>
    );
}
