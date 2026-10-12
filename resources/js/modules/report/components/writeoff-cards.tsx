// Write-off report cards: by month, by reason, by category and rentals by contract (data: useAssetWriteoffBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAssetWriteoffBreakdown } from '../hooks/use-reports';
import type { AssetWriteoffBreakdown, ChartSeries, TabularFilters } from '../types';
import {
    barTop,
    CardTitle,
    CODE_LINK,
    currentMonth,
    CardEmpty as Empty,
    fold,
    FoldToggle,
    monthDensity,
    monthLabel,
    monthLabelPlace,
    SCROLL_AFTER_MONTHS,
    SCROLL_MONTH_PX,
    StackBar,
    Swatch,
} from './chart-parts';
import { FILL } from './chart-tones';
import { InfoPopover } from './info-popover';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { niceMax } from './weekly-ticket-chart';
import { YearsTip } from './years-tip';

type T = (key: string) => string;
type Lang = 'th' | 'en';
type Month = AssetWriteoffBreakdown['months'][number];
type Category = AssetWriteoffBreakdown['categories'][number];
type Contract = AssetWriteoffBreakdown['contracts'][number];

/** The three ways an asset leaves: bought orange, rented handed back green, rented written off another way pink. */
const SERIES: (ChartSeries & { key: 'bought' | 'returned' | 'rented_other' })[] = [
    { key: 'bought', label_key: 'rep_wo_series_bought', tone: 'soft-orange' },
    { key: 'returned', label_key: 'rep_wo_series_returned', tone: 'soft-green' },
    { key: 'rented_other', label_key: 'rep_wo_series_rented_other', tone: 'soft-pink' },
];

/** A reason's split: bought / rented (returned or not), the tiles' two source tones. */
const SOURCES: ChartSeries[] = [
    { key: 'bought', label_key: 'rep_src_purchased', tone: 'soft-orange' },
    { key: 'rented', label_key: 'rep_src_rented', tone: 'soft-violet' },
];

/** Age at write-off, youngest first: red under 3 years, blue (well apart from bought's orange) 3–5, green over 5. */
const BANDS: (ChartSeries & { key: 'under_3' | 'from_3_to_5' | 'over_5' })[] = [
    { key: 'under_3', label_key: 'rep_wo_band_under_3', tone: 'soft-red' },
    { key: 'from_3_to_5', label_key: 'rep_wo_band_3_5', tone: 'soft-blue' },
    { key: 'over_5', label_key: 'rep_wo_band_over_5', tone: 'soft-green' },
];

const contractSeries = (overdue: boolean): ChartSeries[] => [
    { key: 'returned', label_key: 'rep_wo_ct_col_returned', tone: 'soft-green' },
    { key: 'written_off_other', label_key: 'rep_wo_ct_col_other', tone: 'soft-pink' },
    { key: 'still_out', label_key: overdue ? 'rep_wo_ct_out_overdue' : 'rep_wo_ct_col_out', tone: overdue ? 'soft-red' : 'asset-deployed' },
];

/** A category that served under this many years on average is flagged. */
const SHORT_LIFE_YEARS = 3;

/** Reasons listed before the rest fold under "แสดงทั้งหมด". */
const REASONS_SHOWN = 10;

/** A month bar's piece gets its own count once it is at least this share of the tallest bar. */
const SEGMENT_LABEL_SHARE = 0.12;

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle';
const NUM = 'text-right font-mono tabular-nums';

const locale = (lang: Lang) => (lang === 'th' ? 'th-TH' : 'en-US');
const count = (n: number, lang: Lang) => n.toLocaleString(locale(lang));
// Two decimals and no ฿, like the money tile and the list's value column on the same page.
const money = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const endDate = (iso: string, lang: Lang) =>
    new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(`${iso}T00:00:00`),
    );
const years = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A heading-right legend for a set of series, optionally with each one's count. */
function Legend({ series, counts }: { series: ChartSeries[]; counts?: Record<string, number> }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {series.map((s) => (
                <Swatch key={s.key} fill={FILL[s.tone]}>
                    {t(s.label_key)}
                    {counts && <b className="text-foreground font-mono font-semibold tabular-nums">{count(counts[s.key] ?? 0, lang)}</b>}
                </Swatch>
            ))}
        </span>
    );
}

/* ─────────────────────────── month chart ─────────────────────────── */

function MonthCard({ months, to }: { months: Month[]; to: string | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const thisMonth = currentMonth();
    const today = new Date();
    const toDate = to ? new Date(`${to}T00:00:00`) : today;
    const countedTo = toDate < today ? toDate : today;
    const partialNote = t('rep_wo_month_partial_tip').replace(
        '{date}',
        new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
            countedTo,
        ),
    );
    const hasPartial = months.some((m) => m.month === thisMonth);
    const total = months.reduce((sum, m) => sum + m.total, 0);
    const peak = months.reduce<Month | null>((best, m) => (m.total > (best?.total ?? 0) ? m : best), null);
    const top = niceMax(peak?.total ?? 0);
    const ticks = [0, top / 2, top];
    const minorTicks = [top / 4, (top * 3) / 4];
    const at = (v: number) => ({ bottom: `${(v / top) * 100}%` });
    const counts = Object.fromEntries(SERIES.map((s) => [s.key, months.reduce((sum, m) => sum + m[s.key], 0)]));
    const peakText = peak
        ? t('rep_wo_month_peak')
              .replace('{month}', monthLabel(peak.month, lang, false, true))
              .replace('{n}', count(peak.total, lang))
        : '';
    const density = monthDensity(months);
    const scroll = months.length > SCROLL_AFTER_MONTHS;
    const scroller = useRef<HTMLDivElement>(null);
    const bars = useRef(new Map<string, HTMLElement>());
    const [scrollbar, setScrollbar] = useState(0);
    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element) return;
        element.scrollLeft = element.scrollWidth;
        const observer = new ResizeObserver(() => setScrollbar(element.offsetHeight - element.clientHeight));
        observer.observe(element);
        return () => observer.disconnect();
    }, [months]);
    const monthText = (m: Month) =>
        [
            monthLabel(m.month, lang, false, true),
            ...SERIES.filter((s) => m[s.key] > 0).map((s) => `${t(s.label_key)} ${count(m[s.key], lang)}`),
            `${t('rep_wo_month_col_total')} ${count(m.total, lang)}`,
            m.month === thisMonth ? partialNote : null,
        ]
            .filter(Boolean)
            .join(', ');

    return (
        <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
            <CardTitle
                title={t('rep_wo_month_title')}
                note={peak ? peakText : undefined}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Legend series={SERIES} counts={counts} />
                        {hasPartial && (
                            <span className="inline-flex items-center gap-1.5">
                                {density.thin ? (
                                    <i aria-hidden className="bg-brand inline-block h-2 w-2 rounded-full" />
                                ) : (
                                    <i aria-hidden className="border-brand inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed" />
                                )}
                                {t('rep_wo_month_partial')}
                            </span>
                        )}
                    </span>
                }
            />
            {total === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_wo_month_aria')
                            .replace('{from}', monthLabel(months[0].month, lang, false, true))
                            .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                            .replace('{n}', count(total, lang))
                            .replace('{peak}', peakText)}
                        {hasPartial && ` ${t('rep_wo_month_partial')} ${partialNote}`}
                    </p>
                    <div className="flex min-h-56 flex-1 gap-2">
                        <div aria-hidden className="w-6 shrink-0 pt-[22px]" style={{ paddingBottom: `calc(2.25rem + ${scrollbar}px)` }}>
                            <div className="relative h-full">
                                {ticks.map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 translate-y-1/2 font-mono text-[10.5px] leading-none tabular-nums"
                                        style={at(v)}
                                    >
                                        {count(v, lang)}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div ref={scroller} className={cn('flex min-w-0 flex-1 flex-col', scroll && 'overflow-x-auto overflow-y-hidden')}>
                            <div className="flex min-w-full flex-1 flex-col" style={scroll ? { width: months.length * SCROLL_MONTH_PX } : undefined}>
                                <div className="border-border relative mt-[22px] flex-1 border-b">
                                    <div aria-hidden>
                                        {ticks.slice(1).map((v) => (
                                            <div key={v} className="border-border absolute inset-x-0 border-t" style={at(v)} />
                                        ))}
                                        {minorTicks.map((v) => (
                                            <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={at(v)} />
                                        ))}
                                    </div>
                                    <div className={cn('absolute inset-0 flex items-end', density.gap)}>
                                        {months.map((m) => (
                                            <InfoPopover
                                                key={m.month}
                                                label={monthText(m)}
                                                anchor={() => barTop(bars.current.get(m.month), density.top && m.total > 0 ? 18 : 0)}
                                                className="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end"
                                                content={<MonthDetail month={m} partialNote={m.month === thisMonth ? partialNote : null} />}
                                            >
                                                <span
                                                    ref={(el) => {
                                                        if (el) bars.current.set(m.month, el);
                                                        else bars.current.delete(m.month);
                                                    }}
                                                    aria-hidden
                                                    className={cn('relative block w-full', density.bar)}
                                                    style={{ height: `${(m.total / top) * 100}%` }}
                                                >
                                                    {m.month === thisMonth &&
                                                        m.total > 0 &&
                                                        (density.thin ? (
                                                            <span className="bg-brand absolute -top-2.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full" />
                                                        ) : (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                        ))}
                                                    {density.top && m.total > 0 && (
                                                        <span
                                                            className={cn(
                                                                'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center font-mono text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                                m.month === thisMonth && 'text-brand',
                                                            )}
                                                        >
                                                            {count(m.total, lang)}
                                                        </span>
                                                    )}
                                                    <span
                                                        className={cn(
                                                            'flex h-full flex-col-reverse gap-px overflow-hidden',
                                                            !density.thin && 'rounded-t-md',
                                                        )}
                                                    >
                                                        {SERIES.map((s) =>
                                                            m[s.key] > 0 ? (
                                                                <span
                                                                    key={s.key}
                                                                    className={cn(
                                                                        'flex min-h-px w-full basis-0 items-center justify-center overflow-hidden font-mono text-[10.5px] leading-none font-semibold text-white tabular-nums [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]',
                                                                        FILL[s.tone],
                                                                    )}
                                                                    style={{ flexGrow: m[s.key] }}
                                                                >
                                                                    {density.pieces && m.total > m[s.key] && m[s.key] / top >= SEGMENT_LABEL_SHARE
                                                                        ? count(m[s.key], lang)
                                                                        : null}
                                                                </span>
                                                            ) : null,
                                                        )}
                                                    </span>
                                                </span>
                                            </InfoPopover>
                                        ))}
                                    </div>
                                </div>
                                <div aria-hidden className={cn('flex h-9 shrink-0 pt-1.5', density.gap)}>
                                    {months.map((m, i) => (
                                        <div key={m.month} className="relative min-w-0 flex-1">
                                            {density.label(i, m.month) && (
                                                <div
                                                    className={cn(
                                                        'absolute top-0 text-[10.5px] whitespace-nowrap',
                                                        monthLabelPlace(density, i, months.length),
                                                    )}
                                                >
                                                    <b
                                                        className={cn(
                                                            'block font-semibold',
                                                            m.month === thisMonth ? 'text-brand' : 'text-foreground',
                                                        )}
                                                    >
                                                        {monthLabel(m.month, lang, false)}
                                                    </b>
                                                    <span className="text-muted-foreground tabular-nums">{m.month.slice(2, 4)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

/** A month's popover: its name, each colour's count, the total, and "counted to …" for this month. */
function MonthDetail({ month, partialNote }: { month: Month; partialNote: string | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {SERIES.filter((s) => month[s.key] > 0).map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                    <Swatch fill={FILL[s.tone]}>{t(s.label_key)}</Swatch>
                    <b className="font-mono tabular-nums">{count(month[s.key], lang)}</b>
                </div>
            ))}
            <div className="border-border flex items-center justify-between gap-4 border-t pt-1">
                <span>{t('rep_wo_month_col_total')}</span>
                <b className="font-mono tabular-nums">{count(month.total, lang)}</b>
            </div>
            {partialNote && <div className="text-muted-foreground">{partialNote}</div>}
        </div>
    );
}

/* ─────────────────────────── reasons ─────────────────────────── */

function ReasonsCard({ reasons }: { reasons: AssetWriteoffBreakdown['reasons'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(reasons, REASONS_SHOWN, open);
    const max = Math.max(1, ...reasons.map((r) => r.total));
    const name = (r: (typeof reasons)[number]) =>
        r.key === 'returned' ? t('rep_wo_outcome_returned') : r.key === 'none' ? t('rep_wo_reason_none') : (r.name ?? t('rep_wo_reason_none'));

    return (
        <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <CardTitle
                title={t('rep_wo_reason_title')}
                note={reasons.length > 0 ? t('rep_wo_reason_count').replace('{n}', count(reasons.length, lang)) : undefined}
                sub={<Legend series={SOURCES} />}
            />
            {reasons.length === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <>
                    <ul className="space-y-3 px-5 py-4">
                        {shown.map((r) => (
                            <li key={r.key} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-end gap-3 text-sm">
                                <span className={cn('line-clamp-2 leading-snug', r.key === 'none' && 'text-muted-foreground')} title={name(r)}>
                                    {name(r)}
                                </span>
                                <StackBar values={{ bought: r.bought, rented: r.rented }} series={SOURCES} scale={max} />
                                <b className="min-w-8 text-right font-mono font-semibold tabular-nums">{count(r.total, lang)}</b>
                            </li>
                        ))}
                    </ul>
                    {folds && <FoldToggle open={open} total={reasons.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── categories ─────────────────────────── */

function AgeBands({ category }: { category: Category }) {
    const t = useT();
    const bands = category.age_bands;
    const sum = bands.under_3 + bands.from_3_to_5 + bands.over_5;
    if (category.bought === 0) return <span className="text-muted-foreground text-xs">{t('rep_wo_rented_only')}</span>;
    if (sum === 0) return <span className="text-muted-foreground">—</span>;

    return (
        <div className="min-w-[11rem]">
            <StackBar values={bands} series={BANDS} scale={sum} />
        </div>
    );
}

function ShortLifeWarning() {
    const t = useT();
    return (
        <InfoPopover
            label={t('rep_wo_short_life')}
            content={t('rep_wo_short_life_tip')}
            className="-my-1 inline-flex h-6 w-6 items-center justify-center"
        >
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
        </InfoPopover>
    );
}

function CategoryCard({ categories, totals }: { categories: Category[]; totals: AssetWriteoffBreakdown['category_totals'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const label = (c: Category) => (c.name === null ? t('rep_wo_no_category') : (lang === 'th' && c.name_th) || c.name);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_wo_cat_title')} info={t('rep_wo_cat_sub')} sub={<Legend series={BANDS} />} />
            {categories.length === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_wo_cat_title')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_col_category')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_total')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_bought')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_rented')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_value')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_avg_life')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_col_age_bands')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_col_under_warranty')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((c) => {
                                const short = c.avg_age_years !== null && c.avg_age_years < SHORT_LIFE_YEARS;
                                return (
                                    <tr key={c.category_id ?? 'none'} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'text-left font-semibold', c.name === null && 'text-muted-foreground')}>
                                            {label(c)}
                                        </th>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{count(c.total, lang)}</td>
                                        <td className={cn(TD, NUM)}>{count(c.bought, lang)}</td>
                                        <td className={cn(TD, NUM, c.rented === 0 && 'text-muted-foreground')}>{count(c.rented, lang)}</td>
                                        <td className={cn(TD, NUM, c.bought === 0 && 'text-muted-foreground')}>
                                            {c.bought === 0 ? '—' : money(c.bought_value, lang)}
                                        </td>
                                        <td className={cn(TD, NUM, 'whitespace-nowrap')}>
                                            {c.avg_age_years === null ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                // Under three years gets an icon and words, not only red.
                                                <span className={cn('inline-flex items-center gap-1', short && 'text-red-700 dark:text-red-400')}>
                                                    {short && <ShortLifeWarning />}
                                                    <YearsTip years={c.avg_age_years}>{years(c.avg_age_years, lang)}</YearsTip>
                                                </span>
                                            )}
                                        </td>
                                        <td className={TD}>
                                            <AgeBands category={c} />
                                        </td>
                                        <td className={cn(TD, 'text-right')}>
                                            {c.under_warranty > 0 ? (
                                                <StatusBadge tone="amber" dot={false} className="font-mono tabular-nums">
                                                    {count(c.under_warranty, lang)}
                                                </StatusBadge>
                                            ) : (
                                                <span className="text-muted-foreground font-mono tabular-nums">0</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {totals && (
                                <tr className="bg-muted/40 font-semibold">
                                    <th scope="row" className={cn(TD, 'text-left')}>
                                        {t('rep_wo_cat_total_row').replace('{n}', String(categories.length))}
                                    </th>
                                    <td className={cn(TD, NUM)}>{count(totals.total, lang)}</td>
                                    <td className={cn(TD, NUM)}>{count(totals.bought, lang)}</td>
                                    <td className={cn(TD, NUM)}>{count(totals.rented, lang)}</td>
                                    <td className={cn(TD, NUM)}>{totals.bought === 0 ? '—' : money(totals.bought_value, lang)}</td>
                                    <td className={cn(TD, NUM)}>
                                        {totals.avg_age_years === null ? (
                                            '—'
                                        ) : (
                                            <YearsTip years={totals.avg_age_years}>{years(totals.avg_age_years, lang)}</YearsTip>
                                        )}
                                    </td>
                                    <td className={TD}>
                                        <AgeBands category={{ ...totals, category_id: null, name: null, name_th: null }} />
                                    </td>
                                    <td className={cn(TD, NUM)}>{count(totals.under_warranty, lang)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── contracts ─────────────────────────── */

/** What the contract needs next, worded from its flag; the extra lines stand on their own. */
function contractTodo(t: T, lang: Lang, c: Contract): { main: string; tone: 'bad' | 'warn' | 'ok' | 'muted'; extra: string[] } {
    const d = c.days_left === null ? null : Math.abs(c.days_left);
    const extra: string[] = [];
    if (c.flag === 'running' && c.returned_early > 0) extra.push(t('rep_wo_ct_early').replace('{n}', count(c.returned_early, lang)));
    if (c.written_off_other > 0) extra.push(t('rep_wo_ct_other').replace('{n}', count(c.written_off_other, lang)));

    switch (c.flag) {
        case 'overdue':
            return {
                main: t('rep_wo_ct_overdue')
                    .replace('{d}', count(d ?? 0, lang))
                    .replace('{n}', count(c.still_out, lang)),
                tone: 'bad',
                extra,
            };
        case 'ending_soon':
            return {
                main: t('rep_wo_ct_ending_soon')
                    .replace('{d}', count(d ?? 0, lang))
                    .replace('{n}', count(c.still_out, lang)),
                tone: 'warn',
                extra,
            };
        case 'all_returned':
            return { main: t('rep_wo_ct_all_returned'), tone: 'ok', extra };
        default:
            return { main: d === null ? t('rep_wo_ct_no_end') : t('rep_wo_ct_running').replace('{d}', count(d, lang)), tone: 'muted', extra };
    }
}

const TODO_TONE = {
    bad: 'text-red-700 dark:text-red-400 font-semibold',
    warn: 'text-amber-800 dark:text-amber-300 font-semibold',
    ok: 'text-emerald-700 dark:text-emerald-400 font-semibold',
    muted: 'text-muted-foreground',
} as const;

function ContractCard({ contracts }: { contracts: Contract[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_wo_ct_title')}
                info={t('rep_wo_ct_sub')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch fill={FILL['soft-green']}>{t('rep_wo_ct_col_returned')}</Swatch>
                        <Swatch fill={FILL['soft-pink']}>{t('rep_wo_ct_col_other')}</Swatch>
                        <Swatch fill={FILL['asset-deployed']}>{t('rep_wo_ct_col_out')}</Swatch>
                        {contracts.some((c) => c.flag === 'overdue' && c.still_out > 0) && (
                            <Swatch fill={FILL['soft-red']}>{t('rep_wo_ct_out_overdue')}</Swatch>
                        )}
                    </span>
                }
            />
            {contracts.length === 0 ? (
                <Empty>{t('rep_wo_ct_empty')}</Empty>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_wo_ct_title')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_ct_col_contract')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_ct_col_vendor')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_ct_col_end')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_ct_col_units')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_ct_col_returned')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_ct_col_other')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wo_ct_col_out')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_ct_col_progress')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wo_ct_col_todo')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {contracts.map((c) => {
                                const href = `/contracts?view=${c.id}`;
                                const todo = contractTodo(t, lang, c);
                                return (
                                    <tr key={c.id} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                            {canOpen(href) ? (
                                                <Link to={href} className={CODE_LINK}>
                                                    {c.code}
                                                </Link>
                                            ) : (
                                                <span className="font-mono text-xs font-semibold">{c.code}</span>
                                            )}
                                            {c.name && (
                                                <div className="text-muted-foreground max-w-[16rem] truncate text-xs" title={c.name}>
                                                    {c.name}
                                                </div>
                                            )}
                                        </th>
                                        <td className={TD}>
                                            {c.vendor ? (
                                                <div className="max-w-[12rem] truncate" title={c.vendor}>
                                                    {c.vendor}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className={cn(TD, 'whitespace-nowrap')}>
                                            {c.end_date ? endDate(c.end_date, lang) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className={cn(TD, NUM)}>{count(c.units, lang)}</td>
                                        <td className={cn(TD, NUM, c.returned === 0 && 'text-muted-foreground')}>{count(c.returned, lang)}</td>
                                        <td
                                            className={cn(
                                                TD,
                                                NUM,
                                                c.written_off_other > 0 ? 'font-semibold text-pink-700 dark:text-pink-300' : 'text-muted-foreground',
                                            )}
                                        >
                                            {count(c.written_off_other, lang)}
                                        </td>
                                        <td
                                            className={cn(
                                                TD,
                                                NUM,
                                                c.flag === 'overdue' && c.still_out > 0 && 'font-semibold text-red-700 dark:text-red-400',
                                            )}
                                        >
                                            {count(c.still_out, lang)}
                                        </td>
                                        <td className={TD}>
                                            <div className="min-w-[8rem]">
                                                <StackBar
                                                    values={{ returned: c.returned, written_off_other: c.written_off_other, still_out: c.still_out }}
                                                    series={contractSeries(c.flag === 'overdue')}
                                                    scale={c.units}
                                                />
                                            </div>
                                        </td>
                                        <td className={cn(TD, 'min-w-[14rem] text-[13px]')}>
                                            <div className={TODO_TONE[todo.tone]}>{todo.main}</div>
                                            {todo.extra.map((line) => (
                                                <div key={line} className="text-muted-foreground mt-0.5 text-xs">
                                                    {line}
                                                </div>
                                            ))}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="overflow-hidden lg:col-span-2 xl:col-span-3">
                    <CardHeadingSkeleton />
                    <ChartSkeleton />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={6} />
                </Card>
            </div>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={5} />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={3} />
            </Card>
        </div>
    );
}

export function WriteoffCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAssetWriteoffBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <MonthCard months={data.months} to={typeof filters.to === 'string' ? filters.to : null} />
                <ReasonsCard reasons={data.reasons} />
            </div>
            <CategoryCard categories={data.categories} totals={data.category_totals} />
            <ContractCard contracts={data.contracts} />
        </div>
    );
}
