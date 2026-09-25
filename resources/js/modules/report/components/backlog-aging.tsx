/** Four age buckets of the open-ticket backlog, coloured from fresh (green) to stale (red). */
import { useT } from '@/lang';
import type { TicketOverviewSummary } from '../types';

const BUCKETS = [
    { key: 'd1', label: 'rep_aging_d1', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    { key: 'd3', label: 'rep_aging_d3', tone: 'bg-brand/10 text-brand' },
    { key: 'd7', label: 'rep_aging_d7', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    { key: 'older', label: 'rep_aging_older', tone: 'bg-red-500/10 text-red-700 dark:text-red-400' },
] as const;

export function BacklogAging({ aging }: { aging: TicketOverviewSummary['backlog']['aging'] }) {
    const t = useT();
    return (
        <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
            {BUCKETS.map((b) => (
                <div key={b.key} className={`flex flex-col rounded-lg p-2.5 ${b.tone}`}>
                    <b className="font-mono text-xl">{aging[b.key]}</b>
                    <span className="text-xs">{t(b.label)}</span>
                </div>
            ))}
        </div>
    );
}
