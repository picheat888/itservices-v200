/**
 * Headline numbers above a tabular report's table: one KpiTile per `SummaryItem` from the
 * rows response (`rows.summary`) — mirrors App\Services\Report\Tabular\ReportSummary. Like the
 * Ticket & SLA tiles, a tile carries colour when the report gives it the means: its `share` of
 * the whole as a badge and a meter in the tile's tone, and its `split` as a stacked meter (when
 * there is no share) and as coloured dots in the footer ("● ซื้อ 62 · ● เช่า 18"). Two or three
 * tiles share the row between them on wide screens, so a short strip leaves no empty slot.
 * A tile with a `note` and no split carries that line at its foot instead — a duration in days
 * (hours under a day, as the time-left pills) and/or a short date and time.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { SummaryItem } from '../types';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';

/** Columns on wide screens by tile count — static classes, so Tailwind sees each one. */
const WIDE_COLUMNS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' };

/** "38 วัน" / "5 ชม." — the same rule as HoursLeftBadge. */
function duration(t: (key: string) => string, hours: number): string {
    const abs = Math.abs(hours);
    return abs < 24
        ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(abs))))
        : t('rep_days_n').replace('{n}', String(Math.round(abs / 24)));
}

/** "Y-m-d H:i" → "2 ต.ค. 17:00" (Gregorian years, as the rest of the app). */
function shortMoment(value: string, lang: string): string {
    const [date, time = ''] = value.split(' ');
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return value;
    const day = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short' }).format(
        new Date(y, m - 1, d),
    );
    return time ? `${day} ${time}` : day;
}

function noteText(t: (key: string) => string, lang: string, note: NonNullable<SummaryItem['note']>): string {
    return t(note.label_key)
        .replace('{n}', note.hours === null || note.hours === undefined ? '—' : duration(t, note.hours))
        .replace('{at}', note.at ? shortMoment(note.at, lang) : '—');
}

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <div className={cn('grid grid-cols-2 gap-3', WIDE_COLUMNS[items.length] ?? 'lg:grid-cols-4')}>
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
                            ) : item.note ? (
                                <span className="truncate">{noteText(t, lang, item.note)}</span>
                            ) : undefined
                        }
                    />
                );
            })}
        </div>
    );
}
