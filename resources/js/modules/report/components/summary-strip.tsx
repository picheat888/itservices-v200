/**
 * Headline numbers above a tabular report's table: one KpiTile per `SummaryItem` from the
 * rows response (`rows.summary`) — mirrors App\Services\Report\Tabular\ReportSummary. Like the
 * Ticket & SLA tiles, a tile carries colour when the report gives it the means: its `share` of
 * the whole as a badge and a meter in the tile's tone, and its `split` as a stacked meter (when
 * there is no share) and as coloured dots in the footer ("● ซื้อ 62 · ● เช่า 18").
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { SummaryItem } from '../types';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';

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
                const tone = item.tone ?? 'gray';
                const share = item.share ?? null;
                const split = item.split ?? [];
                const splitTotal = split.reduce((sum, part) => sum + part.value, 0);

                return (
                    <KpiTile
                        key={item.key}
                        label={t(item.label_key)}
                        value={value}
                        badge={share !== null ? <StatusBadge tone={tone}>{`${share}%`}</StatusBadge> : undefined}
                        // A 0-valued tile has nothing to warn about — only flag it once there's
                        // actually something overdue/expiring behind the amber/red tone.
                        alert={(item.tone === 'amber' || item.tone === 'red') && (item.value ?? 0) > 0}
                        bar={
                            share !== null
                                ? [{ key: 'share', percent: share, className: FILL[tone] }]
                                : splitTotal > 0
                                  ? split.map((part) => ({
                                        key: part.key,
                                        percent: (part.value / splitTotal) * 100,
                                        className: FILL[part.tone],
                                        title: `${t(part.label_key)}: ${part.value.toLocaleString(locale)}`,
                                    }))
                                  : undefined
                        }
                        footer={
                            split.length > 0 ? (
                                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                    {split.map((part) => (
                                        <span key={part.key} className="inline-flex items-center gap-1">
                                            <i className={cn('inline-block h-2 w-2 rounded-full', FILL[part.tone])} />
                                            {t(part.label_key)}
                                            <b className="text-foreground font-mono font-semibold">{part.value.toLocaleString(locale)}</b>
                                        </span>
                                    ))}
                                </span>
                            ) : undefined
                        }
                    />
                );
            })}
        </div>
    );
}
