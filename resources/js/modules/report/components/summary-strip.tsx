/**
 * Headline numbers above a tabular report's table: one KpiTile per `SummaryItem` from the
 * rows response (`rows.summary`) — mirrors App\Services\Report\Tabular\ReportSummary.
 */
import { useT } from '@/lang';
import { useUiStore } from '@/stores/ui';
import { KpiTile } from './kpi-tile';
import type { SummaryItem } from '../types';

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {items.map((item) => (
                <KpiTile
                    key={item.key}
                    label={t(item.label_key)}
                    value={item.value === null ? '—' : item.value.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}
                    alert={item.tone === 'amber' || item.tone === 'red'}
                />
            ))}
        </div>
    );
}
