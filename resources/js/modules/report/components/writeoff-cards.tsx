// Write-off report cards: by month, by reason, by category and rentals by contract (data: useAssetWriteoffBreakdown).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAssetWriteoffBreakdown } from '../hooks/use-reports';
import type { AssetWriteoffBreakdown, ChartSeries, TabularFilters } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { fold, FoldToggle, StackBar } from './chart-parts';
import { FILL } from './chart-tones';

type T = (key: string) => string;
type Lang = 'th' | 'en';
type Month = AssetWriteoffBreakdown['months'][number];
type Category = AssetWriteoffBreakdown['categories'][number];
type Contract = AssetWriteoffBreakdown['contracts'][number];

/** The three ways an asset leaves, in the overview's soft tones (bought orange, rented pink). */
const SERIES: (ChartSeries & { key: 'bought' | 'returned' | 'rented_other' })[] = [
    { key: 'bought', label_key: 'rep_wo_series_bought', tone: 'soft-orange' },
    { key: 'returned', label_key: 'rep_wo_series_returned', tone: 'soft-pink' },
    { key: 'rented_other', label_key: 'rep_wo_series_rented_other', tone: 'soft-violet' },
];

/** A reason's split: bought / rented (returned or not), the tiles' two source tones. */
const SOURCES: ChartSeries[] = [
    { key: 'bought', label_key: 'rep_src_purchased', tone: 'soft-orange' },
    { key: 'rented', label_key: 'rep_src_rented', tone: 'soft-pink' },
];

/** Age at write-off, youngest first: red under 3 years, blue (well apart from bought's orange) 3–5, green over 5. */
const BANDS: (ChartSeries & { key: 'under_3' | 'from_3_to_5' | 'over_5' })[] = [
    { key: 'under_3', label_key: 'rep_wo_band_under_3', tone: 'soft-red' },
    { key: 'from_3_to_5', label_key: 'rep_wo_band_3_5', tone: 'soft-blue' },
    { key: 'over_5', label_key: 'rep_wo_band_over_5', tone: 'soft-green' },
];

const contractSeries = (overdue: boolean): ChartSeries[] => [
    { key: 'returned', label_key: 'rep_wo_ct_col_returned', tone: 'soft-pink' },
    { key: 'written_off_other', label_key: 'rep_wo_ct_col_other', tone: 'soft-violet' },
    { key: 'still_out', label_key: overdue ? 'rep_wo_ct_out_overdue' : 'rep_wo_ct_col_out', tone: overdue ? 'soft-red' : 'asset-deployed' },
];

/** A code that opens its record: the report lists' brand link, with a visible keyboard focus ring. */
const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none';

/** A category that served under this many years on average is flagged. */
const SHORT_LIFE_YEARS = 3;

/** Reasons listed before the rest fold under "แสดงทั้งหมด". */
const REASONS_SHOWN = 10;

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold whitespace-nowrap';
const TD = 'px-3 py-2.5 align-middle';
const NUM = 'text-right font-mono tabular-nums';

const locale = (lang: Lang) => (lang === 'th' ? 'th-TH' : 'en-US');
const count = (n: number, lang: Lang) => n.toLocaleString(locale(lang));
// Two decimals and no ฿, like the money tile and the list's value column on the same page.
const money = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const years = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "2026-09" → "ก.ย." (with "26" on the first column and each January when `withYear`). */
function monthLabel(month: string, lang: Lang, withYear: boolean, long = false): string {
    const [y, m] = month.split('-').map(Number);
    const name = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { month: long ? 'long' : 'short' }).format(
        new Date(y, m - 1, 1),
    );
    if (long) return `${name} ${y}`;
    return withYear ? `${name} ${String(y).slice(2)}` : name;
}

/** Card heading: h2 title, optional note, legend on the right. */
function CardTitle({ id, title, note, sub }: { id?: string; title: React.ReactNode; note?: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 id={id} className="text-sm font-semibold">
                    {title}
                </h2>
                {note && <p className="text-muted-foreground text-xs">{note}</p>}
            </div>
            {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
        </div>
    );
}

/** A legend entry as on the overview's cards: a dot in the mark's colour, then what it means. */
function Swatch({ fill, children }: { fill: string; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', fill)} />
            {children}
        </span>
    );
}

/** A heading-right legend for a set of series, optionally with each one's count. */
function Legend({ series, counts }: { series: ChartSeries[]; counts?: Record<string, number> }) {
    const t = useT();
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {series.map((s) => (
                <Swatch key={s.key} fill={FILL[s.tone]}>
                    {t(s.label_key)}
                    {counts && <b className="text-foreground font-mono font-semibold tabular-nums">{counts[s.key] ?? 0}</b>}
                </Swatch>
            ))}
        </span>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground px-5 py-10 text-center text-sm">{children}</div>;
}

/* ─────────────────────────── month chart ─────────────────────────── */

function MonthCard({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const titleId = useId();
    const total = months.reduce((sum, m) => sum + m.total, 0);
    const peak = months.reduce<Month | null>((best, m) => (m.total > (best?.total ?? 0) ? m : best), null);
    const top = Math.max(1, peak?.total ?? 0);
    const counts = Object.fromEntries(SERIES.map((s) => [s.key, months.reduce((sum, m) => sum + m[s.key], 0)]));
    const peakText = peak
        ? t('rep_wo_month_peak')
              .replace('{month}', monthLabel(peak.month, lang, false, true))
              .replace('{n}', count(peak.total, lang))
        : '';

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                id={titleId}
                title={t('rep_wo_month_title')}
                note={peak ? peakText : undefined}
                sub={<Legend series={SERIES} counts={counts} />}
            />
            {total === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <div role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-summary`} className="flex flex-1 flex-col">
                        {/* As the overview's "in the warehouse" columns: a baseline, rounded tops, the value on top. */}
                        <div aria-hidden className="border-border flex min-h-40 flex-1 items-end gap-1 border-b sm:gap-2">
                            {months.map((m) => (
                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                                    {m.total > 0 && <span className="font-mono text-xs font-semibold tabular-nums">{m.total}</span>}
                                    {/* Bought at the foot, rented on top. */}
                                    <div
                                        className="flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-md"
                                        style={{ height: `${(m.total / top) * 100}%` }}
                                    >
                                        {SERIES.map((s) =>
                                            m[s.key] > 0 ? (
                                                <span key={s.key} className={cn('block w-full', FILL[s.tone])} style={{ flexGrow: m[s.key] }} />
                                            ) : null,
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div aria-hidden className="mt-2 flex gap-1 sm:gap-2">
                            {months.map((m, i) => (
                                <span key={m.month} className="text-muted-foreground min-w-0 flex-1 truncate text-center text-xs">
                                    {monthLabel(m.month, lang, i === 0 || m.month.endsWith('-01'))}
                                </span>
                            ))}
                        </div>
                        <p id={`${titleId}-summary`} className="sr-only">
                            {t('rep_wo_month_aria')
                                .replace('{from}', monthLabel(months[0].month, lang, false, true))
                                .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                                .replace('{n}', count(total, lang))
                                .replace('{peak}', peakText)}
                        </p>
                    </div>
                    {/* Every month's numbers for a screen reader (the chart itself is one image). */}
                    <table className="sr-only">
                        <caption>{t('rep_wo_month_title')}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('rep_wo_month_col')}</th>
                                {SERIES.map((s) => (
                                    <th key={s.key} scope="col">
                                        {t(s.label_key)}
                                    </th>
                                ))}
                                <th scope="col">{t('rep_wo_month_col_total')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((m) => (
                                <tr key={m.month}>
                                    <th scope="row">{monthLabel(m.month, lang, false, true)}</th>
                                    {SERIES.map((s) => (
                                        <td key={s.key}>{m[s.key]}</td>
                                    ))}
                                    <td>{m.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
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
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_wo_reason_title')}
                note={reasons.length > 0 ? t('rep_wo_reason_count').replace('{n}', String(reasons.length)) : undefined}
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
                                <b className="w-8 text-right font-mono font-semibold tabular-nums">{count(r.total, lang)}</b>
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

function CategoryCard({ categories, totals }: { categories: Category[]; totals: AssetWriteoffBreakdown['category_totals'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const label = (c: Category) => (c.name === null ? t('rep_wo_no_category') : (lang === 'th' && c.name_th) || c.name);

    return (
        <Card className="overflow-hidden">
            <CardTitle title={t('rep_wo_cat_title')} note={t('rep_wo_cat_sub')} sub={<Legend series={BANDS} />} />
            {categories.length === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_wo_cat_title')}</caption>
                        <thead>
                            <tr className="bg-muted/40 border-border border-b">
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
                                                    {short && <AlertTriangle aria-hidden className="h-3.5 w-3.5" />}
                                                    {years(c.avg_age_years, lang)}
                                                    {short && <span className="sr-only">{t('rep_wo_short_life')}</span>}
                                                </span>
                                            )}
                                        </td>
                                        <td className={TD}>
                                            <AgeBands category={c} />
                                        </td>
                                        <td className={cn(TD, 'text-right')}>
                                            {c.under_warranty > 0 ? (
                                                <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-800 tabular-nums dark:text-amber-300">
                                                    {count(c.under_warranty, lang)}
                                                </span>
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
                                    <td className={cn(TD, NUM)}>{totals.avg_age_years === null ? '—' : years(totals.avg_age_years, lang)}</td>
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
function contractTodo(t: T, c: Contract): { main: string; tone: 'bad' | 'warn' | 'ok' | 'muted'; extra: string[] } {
    const d = c.days_left === null ? null : Math.abs(c.days_left);
    const extra: string[] = [];
    if (c.flag === 'running' && c.returned_early > 0) extra.push(t('rep_wo_ct_early').replace('{n}', String(c.returned_early)));
    if (c.written_off_other > 0) extra.push(t('rep_wo_ct_other').replace('{n}', String(c.written_off_other)));

    switch (c.flag) {
        case 'overdue':
            return { main: t('rep_wo_ct_overdue').replace('{d}', String(d)).replace('{n}', String(c.still_out)), tone: 'bad', extra };
        case 'ending_soon':
            return { main: t('rep_wo_ct_ending_soon').replace('{d}', String(d)).replace('{n}', String(c.still_out)), tone: 'warn', extra };
        case 'all_returned':
            return { main: t('rep_wo_ct_all_returned'), tone: 'ok', extra };
        default:
            return { main: d === null ? t('rep_wo_ct_no_end') : t('rep_wo_ct_running').replace('{d}', String(d)), tone: 'muted', extra };
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
        <Card className="overflow-hidden">
            <CardTitle
                title={t('rep_wo_ct_title')}
                note={t('rep_wo_ct_sub')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch fill={FILL['soft-pink']}>{t('rep_wo_ct_col_returned')}</Swatch>
                        <Swatch fill={FILL['soft-violet']}>{t('rep_wo_ct_col_other')}</Swatch>
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
                            <tr className="bg-muted/40 border-border border-b">
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
                                const todo = contractTodo(t, c);
                                return (
                                    <tr key={c.id} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                            {canOpen(href) ? (
                                                <Link to={href} className={CODE_LINK}>
                                                    {c.code}
                                                </Link>
                                            ) : (
                                                <span className="font-mono text-xs font-bold">{c.code}</span>
                                            )}
                                            {c.name && (
                                                <div className="text-muted-foreground max-w-[16rem] truncate text-xs" title={c.name}>
                                                    {c.name}
                                                </div>
                                            )}
                                        </th>
                                        <td className={cn(TD, 'max-w-[12rem] truncate')} title={c.vendor ?? undefined}>
                                            {c.vendor ?? <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className={cn(TD, 'font-mono text-xs whitespace-nowrap tabular-nums')}>{c.end_date ?? '—'}</td>
                                        <td className={cn(TD, NUM)}>{count(c.units, lang)}</td>
                                        <td className={cn(TD, NUM, c.returned === 0 && 'text-muted-foreground')}>{count(c.returned, lang)}</td>
                                        <td
                                            className={cn(
                                                TD,
                                                NUM,
                                                c.written_off_other > 0
                                                    ? 'font-semibold text-violet-700 dark:text-violet-300'
                                                    : 'text-muted-foreground',
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
                                                <span className="sr-only">
                                                    {t('rep_wo_ct_progress')
                                                        .replace('{x}', count(c.returned, lang))
                                                        .replace('{y}', count(c.units, lang))}
                                                </span>
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

/** Pulsing blocks in the cards' shapes while the breakdown loads (still for reduced motion). */
function CardsSkeleton() {
    const block = 'bg-muted rounded-xl motion-safe:animate-pulse';
    return (
        <div className="space-y-4" aria-hidden>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <div className={cn(block, 'h-72')} />
                <div className={cn(block, 'h-72')} />
            </div>
            <div className={cn(block, 'h-56')} />
            <div className={cn(block, 'h-40')} />
        </div>
    );
}

/** The cards between the summary tiles and the list. */
export function WriteoffCards({ filters }: { filters: TabularFilters }) {
    const { data, isLoading } = useAssetWriteoffBreakdown(filters);

    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <MonthCard months={data.months} />
                <ReasonsCard reasons={data.reasons} />
            </div>
            <CategoryCard categories={data.categories} totals={data.category_totals} />
            <ContractCard contracts={data.contracts} />
        </div>
    );
}
