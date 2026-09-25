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
            {items.map((item) => {
                const locale = lang === 'th' ? 'th-TH' : 'en-US';
                const value =
                    item.value === null
                        ? '—'
                        : item.format === 'money'
                          ? item.value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : item.value.toLocaleString(locale);

                return (
                    <KpiTile
                        key={item.key}
                        label={t(item.label_key)}
                        value={value}
                        // A 0-valued tile has nothing to warn about — only flag it once there's
                        // actually something overdue/expiring behind the amber/red tone.
                        alert={(item.tone === 'amber' || item.tone === 'red') && (item.value ?? 0) > 0}
                    />
                );
            })}
        </div>
    );
}
