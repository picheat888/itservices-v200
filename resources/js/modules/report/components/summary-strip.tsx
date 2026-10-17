// Headline tiles above a tabular report (rows.summary, mirrors ReportSummary): share badge + meter, split bar + dots,
// a note line, a goal meter, or a request trend (Delta + Sparkline). Formats: count, money, percent, hours, years, days.
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { SummaryItem } from '../types';
import { reportDates, Sparkline } from './chart-parts';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';
import { TileChart } from './tile-chart';
import { YearsTip } from './years-tip';

/** Columns on wide screens by tile count — static classes, so Tailwind sees each one. */
const WIDE_COLUMNS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 5: 'lg:grid-cols-3 xl:grid-cols-5' };

export const summaryColumns = (tiles: number) => WIDE_COLUMNS[tiles] ?? 'lg:grid-cols-4';

/** "38 วัน" / "5 ชม." — the same rule as HoursLeftBadge. */
function duration(t: (key: string) => string, hours: number): string {
    const abs = Math.abs(hours);
    return abs < 24
        ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(abs))))
        : t('rep_days_n').replace('{n}', String(Math.round(abs / 24)));
}

/** "Y-m-d H:i" → date and time in the system date setting. */
function shortMoment(value: string, lang: string): string {
    return reportDates(lang).dateTime(value);
}

function noteText(t: (key: string) => string, lang: string, note: NonNullable<SummaryItem['note']>): string {
    // Words, then named numbers, so a {n} among them is not read as the duration below.
    let text = Object.entries(note.texts ?? {}).reduce(
        (s, [name, value]) => s.replaceAll(`{${name}}`, typeof value === 'string' ? value : (lang === 'th' && value.name_th) || value.name),
        t(note.label_key),
    );
    text = Object.entries(note.values ?? {}).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, value.toLocaleString()), text);
    if (note.hours !== undefined) text = text.replace('{n}', note.hours === null ? '—' : duration(t, note.hours));
    return text.replace('{at}', note.at ? shortMoment(note.at, lang) : '—');
}

/** As the Report Center's change: ▲ green, ▼ red, no change grey; the line a shade lighter. */
const TREND = {
    up: { mark: '▲ ', ink: 'text-emerald-600 dark:text-emerald-400', line: 'text-emerald-500 dark:text-emerald-400' },
    down: { mark: '▼ ', ink: 'text-red-600 dark:text-red-400', line: 'text-red-500 dark:text-red-400' },
    even: { mark: '', ink: 'text-muted-foreground', line: 'text-muted-foreground' },
};

type Note = NonNullable<SummaryItem['note']>;

/** A tile line's colour: its own tone when it says one ("bad" = red), else its trend's. */
const lineTone = (item: SummaryItem) =>
    item.chart?.kind === 'line' && item.chart.tone
        ? TREND[item.chart.tone === 'bad' ? 'down' : 'up'].line
        : TREND[item.note?.trend?.direction ?? 'even'].line;

const trendText = (t: (key: string) => string, trend: NonNullable<Note['trend']>) =>
    Object.entries(trend.values ?? {}).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, value.toLocaleString()), t(trend.label_key));

/** The note's words, then its trend (when it has one) in the trend's colour. */
function NoteLine({ note }: { note: Note }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (!note.trend) return <>{noteText(t, lang, note)}</>;
    const { mark, ink } = TREND[note.trend.direction];
    return (
        <>
            {noteText(t, lang, note)}{' '}
            <span className={cn('font-semibold whitespace-nowrap', ink)}>
                <span aria-hidden>{mark}</span>
                {trendText(t, note.trend)}
            </span>
        </>
    );
}

const noteTitle = (t: (key: string) => string, lang: string, note: Note) =>
    note.trend ? `${noteText(t, lang, note)} ${trendText(t, note.trend)}` : noteText(t, lang, note);

/** A request trend as the snapshot strip draws it: "▲ 3 จากช่วงก่อนหน้า" left, the line right, both in the same good / bad colour. */
function DeltaFooter({
    trend,
    decimals,
    lead,
    chart,
}: {
    trend: NonNullable<Note['trend']>;
    decimals: number;
    /** The note's own words, a line above the change ("อัตราลาออก 9.1%"). */
    lead?: string;
    /** The tile's own small chart, in place of the trend's line. */
    chart?: React.ReactNode;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const delta = trend.values?.delta;
    const neutral = trend.direction === 'even' || trend.up_is_good === null || trend.up_is_good === undefined;
    const good = neutral ? null : (trend.direction === 'up') === trend.up_is_good;
    const shade = good === null ? TREND.even : good ? TREND.up : TREND.down;
    const places = trend.decimals ?? decimals;
    const size = delta?.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
    const change =
        delta === undefined ? (
            <span className="text-muted-foreground">{t(trend.label_key)}</span>
        ) : (
            <>
                <span className={cn('font-semibold', shade.ink)}>
                    {trend.direction === 'even' ? t('rep_snap_same') : `${trend.direction === 'up' ? '▲' : '▼'} ${size}`}
                </span>{' '}
                <span className="text-muted-foreground">{t(trend.label_key)}</span>
            </>
        );

    // Chart hides on a narrow tile
    const side = (node: React.ReactNode) => node && <span className="hidden shrink-0 @[11.5rem]:inline-flex">{node}</span>;

    if (lead) {
        return (
            <span className="@container block">
                <span className="flex items-end justify-between gap-1.5">
                    <span className="min-w-0">
                        <span className="block truncate">{lead}</span>
                        <span className="block truncate">{change}</span>
                    </span>
                    {side(chart ?? (trend.points && <Sparkline values={trend.points} className={shade.line} />))}
                </span>
            </span>
        );
    }

    return (
        <span className="@container block">
            <span className="flex min-h-5 items-center justify-between gap-1.5">
                <span className="min-w-0 truncate">{change}</span>
                {side(trend.points && <Sparkline values={trend.points} className={shade.line} />)}
            </span>
        </span>
    );
}

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const assetStatusColors = useUiStore((s) => s.assetStatusColors);

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(items.length))}>
            {items.map((item) => {
                const locale = lang === 'th' ? 'th-TH' : 'en-US';
                const value =
                    item.value === null
                        ? '—'
                        : item.format === 'money'
                          ? item.value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : item.format === 'hours' || item.format === 'years' || item.format === 'days'
                            ? item.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                            : item.value.toLocaleString(locale);
                const unit =
                    item.value === null
                        ? undefined
                        : item.format === 'percent'
                          ? '%'
                          : item.format === 'hours'
                            ? t('rep_hours')
                            : item.format === 'years'
                              ? t('rep_years')
                              : item.format === 'days'
                                ? t('rep_days')
                                : undefined;
                const goal = item.format === 'percent' && item.goal != null && item.value !== null ? item.goal : null;
                const tone = item.tone ?? 'gray';
                // A soft tone fills lighter; the badge and the warning keep the base meaning.
                const base = tone.replace(/^soft-/, '') as 'amber' | 'red' | 'green' | 'violet' | 'blue' | 'gray';
                // An asset-status tile wears the badge colour chosen in Settings → Assets.
                const assetColor = tone.startsWith('asset-') ? assetStatusColors[tone.slice(6).replace(/-/g, '_')] : undefined;
                const share = item.share ?? null;
                const split = item.split ?? [];
                // A tiny chart at the footer's right, as the sparkline beside a trend note.
                const chart = item.chart ? <TileChart chart={item.chart} title={t(item.label_key)} lineClass={lineTone(item)} /> : null;
                const splitTotal = split.reduce((sum, part) => sum + part.value, 0);
                // An hours tile splits into hours, the unit outside the number; other splits are counts.
                const partNumber = (value: number, counts = false) =>
                    item.format === 'hours' && !counts
                        ? value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                        : value.toLocaleString(locale);
                const partUnit = (counts = false) => (item.format === 'hours' && !counts ? t('rep_hours') : null);
                const partText = (value: number, counts = false) =>
                    partUnit(counts) ? `${partNumber(value, counts)} ${partUnit(counts)}` : partNumber(value, counts);

                return (
                    <KpiTile
                        key={item.key}
                        label={t(item.label_key)}
                        value={item.format === 'years' && item.value !== null ? <YearsTip years={item.value}>{value}</YearsTip> : value}
                        unit={unit}
                        badge={
                            share !== null ? (
                                assetColor ? (
                                    <StatusBadge color={assetColor}>{`${share}%`}</StatusBadge>
                                ) : (
                                    <StatusBadge tone={base}>{`${share}%`}</StatusBadge>
                                )
                            ) : goal !== null ? (
                                <StatusBadge tone="green">{t('rep_kpi_goal').replace('{n}', String(goal))}</StatusBadge>
                            ) : undefined
                        }
                        // Flagged only above zero: red below the goal or for a red tile, amber for an amber one.
                        alert={
                            (goal !== null && (item.value ?? 0) < goal) || ((base === 'red' || item.attention === 'red') && (item.value ?? 0) > 0)
                                ? 'red'
                                : (base === 'amber' || item.attention === 'amber') && (item.value ?? 0) > 0
                                  ? 'amber'
                                  : false
                        }
                        meter={goal !== null ? { value: item.value ?? 0, goal } : undefined}
                        bar={
                            goal !== null || item.chart
                                ? undefined
                                : share !== null
                                  ? [{ key: 'share', percent: share, className: FILL[tone] }]
                                  : item.progress != null
                                    ? [{ key: 'progress', percent: item.progress, className: FILL[tone], title: `${item.progress}%` }]
                                    : splitTotal > 0
                                      ? split.map((part) => ({
                                            key: part.key,
                                            percent: (part.value / splitTotal) * 100,
                                            className: FILL[part.tone],
                                            title: `${t(part.label_key)}: ${partText(part.value, part.counts)}`,
                                        }))
                                      : split.length > 0
                                        ? [] // all zero: the grey track alone
                                        : undefined
                        }
                        footer={
                            split.length > 0 ? (
                                // One line: every dot and number stays, the names cut with "…"; the whole split opens in a note on hover or tap.
                                <span className="flex items-center justify-between gap-3">
                                    <InfoPopover
                                        label={split.map((part) => `${t(part.label_key)} ${partText(part.value, part.counts)}`).join(', ')}
                                        className="grid min-w-0 flex-1 auto-cols-[minmax(0,max-content)] grid-flow-col items-center gap-x-2.5 text-left"
                                        content={
                                            <div className="min-w-44 space-y-1">
                                                <div className="font-semibold">{t(item.label_key)}</div>
                                                {split.map((part) => (
                                                    <div key={part.key} className="flex items-center justify-between gap-4">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <i aria-hidden className={cn('inline-block h-2 w-2 rounded-full', FILL[part.tone])} />
                                                            {t(part.label_key)}
                                                        </span>
                                                        <b className={cn('tabular-nums', part.value === 0 && 'text-muted-foreground font-normal')}>
                                                            {partText(part.value, part.counts)}
                                                        </b>
                                                    </div>
                                                ))}
                                                {item.note && (
                                                    <div className="text-muted-foreground border-border border-t pt-1">
                                                        <NoteLine note={item.note} />
                                                    </div>
                                                )}
                                            </div>
                                        }
                                    >
                                        {split.map((part) => (
                                            <span key={part.key} className="flex min-w-0 items-center gap-1">
                                                <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', FILL[part.tone])} />
                                                <span className="truncate">{t(part.short_key ?? part.label_key)}</span>
                                                <span className="shrink-0">
                                                    <b className="text-foreground font-semibold">{partNumber(part.value, part.counts)}</b>
                                                    {partUnit(part.counts) && ` ${partUnit(part.counts)}`}
                                                </span>
                                            </span>
                                        ))}
                                        {/* What the split is over ("จาก 7 เคสที่เสร็จสิ้น"), when the report says. */}
                                        {item.note && (
                                            <span className="min-w-0 truncate">
                                                <NoteLine note={item.note} />
                                            </span>
                                        )}
                                    </InfoPopover>
                                    {chart}
                                </span>
                            ) : item.note?.trend && item.note.trend.up_is_good !== undefined ? (
                                <DeltaFooter
                                    trend={item.note.trend}
                                    decimals={item.format === 'days' ? 1 : 0}
                                    lead={item.note.label_key !== item.note.trend.label_key ? noteText(t, lang, item.note) : undefined}
                                    chart={chart}
                                />
                            ) : item.note ? (
                                <span className="flex items-end justify-between gap-3">
                                    <span
                                        className="min-w-0 truncate"
                                        title={noteTitle(t, lang, item.note.full_key ? { ...item.note, label_key: item.note.full_key } : item.note)}
                                    >
                                        <NoteLine note={item.note} />
                                    </span>
                                    {item.note.trend?.points && (
                                        <Sparkline values={item.note.trend.points} className={TREND[item.note.trend.direction].line} />
                                    )}
                                    {chart}
                                </span>
                            ) : undefined
                        }
                    />
                );
            })}
        </div>
    );
}
