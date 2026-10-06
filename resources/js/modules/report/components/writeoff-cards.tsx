/**
 * The "การตัดจำหน่ายทรัพย์สิน" page's own cards (pages/assets-writeoffs.tsx), from the design mockup,
 * between the summary tiles and the list:
 *
 * - "ตัดจำหน่ายรายเดือน": a stacked column per month of the range (bought / rented handed back to the
 *   lessor / rented written off another way), the total over each column, empty months kept;
 * - "เหตุผลที่ตัดจำหน่าย": one bar per reason split bought / rented, the counts written out;
 * - "ตามหมวดหมู่": counts, bought value, average service life and the age bands, still-under-warranty;
 * - "เครื่องเช่าตามสัญญา": every rental contract with assets (all-time), how many came back, how
 *   many left another way, how many are still out, and what to do next.
 *
 * Accessibility (WCAG 2.2 AA): every coloured mark has its number or words beside it (1.4.1), the
 * fills reach 3:1 against the card in both themes (1.4.11), the month chart is an image with a
 * summary plus a screen-reader table (1.1.1), tables have captions and scoped headers (1.3.1), the
 * card titles are h2 under the page's h1, and nothing animates for a reader who asked for less
 * motion. All of it reads useAssetWriteoffBreakdown (AssetWriteoffReport::breakdown).
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAssetWriteoffBreakdown } from '../hooks/use-reports';
import type { AssetWriteoffBreakdown, TabularFilters } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { fold, FoldToggle } from './chart-parts';

type T = (key: string) => string;
type Lang = 'th' | 'en';
type Month = AssetWriteoffBreakdown['months'][number];
type Category = AssetWriteoffBreakdown['categories'][number];
type Contract = AssetWriteoffBreakdown['contracts'][number];

/**
 * The three ways an asset leaves, each with a fill that holds 3:1 against the card in light and
 * dark (the soft tones of the summary tiles are too pale for bars on white).
 */
const SERIES = [
    { key: 'bought', label: 'rep_wo_series_bought', fill: 'bg-orange-600 dark:bg-orange-400' },
    { key: 'returned', label: 'rep_wo_series_returned', fill: 'bg-pink-600 dark:bg-pink-400' },
    { key: 'rented_other', label: 'rep_wo_series_rented_other', fill: 'bg-violet-600 dark:bg-violet-400' },
] as const;

/** Age at write-off, youngest first: under 3 years reads as a warning. */
const BANDS = [
    { key: 'under_3', label: 'rep_wo_band_under_3', fill: 'bg-red-600 dark:bg-red-400' },
    { key: 'from_3_to_5', label: 'rep_wo_band_3_5', fill: 'bg-amber-700 dark:bg-amber-400' },
    { key: 'over_5', label: 'rep_wo_band_over_5', fill: 'bg-emerald-600 dark:bg-emerald-400' },
] as const;

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

/** "2028-01-19" → "19 ม.ค. 2028" (Gregorian years, as the rest of the app). */
function dayLabel(date: string | null, lang: Lang): string {
    if (!date) return '—';
    const [y, m, d] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(y, m - 1, d),
    );
}

/** A gridline step that gives three to five lines: 1, 2, 5, 10, 20, 50… */
function niceStep(max: number): number {
    if (max <= 4) return 1;
    const raw = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
}

/**
 * A card's tinted heading with its title as an h2 (under the page's h1), an optional `note`
 * beside it, and on the right a legend or a count. The note sits outside the h2 so a screen
 * reader's heading list reads just the title, not the explanation run into it.
 */
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

/** A legend entry: a small square in the mark's colour, then what it means (and how many). */
function Swatch({ fill, children }: { fill: string; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className={cn('inline-block h-2.5 w-2.5 rounded-sm', fill)} />
            {children}
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
    const step = niceStep(peak?.total ?? 0);
    const top = Math.max(step, Math.ceil((peak?.total ?? 0) / step) * step);
    const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
    const sums = SERIES.map((s) => ({ ...s, n: months.reduce((sum, m) => sum + m[s.key], 0) }));
    const peakText = peak
        ? t('rep_wo_month_peak')
              .replace('{month}', monthLabel(peak.month, lang, false, true))
              .replace('{n}', count(peak.total, lang))
        : '';

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle id={titleId} title={t('rep_wo_month_title')} sub={peak ? peakText : undefined} />
            {total === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <div className="px-5 pt-4 pb-3">
                    <div
                        role="img"
                        aria-labelledby={titleId}
                        aria-describedby={`${titleId}-summary`}
                        // mt-3: room above the tallest column for its total and the top axis number.
                        className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
                    >
                        {/* The y-axis numbers, top down, against the gridlines. */}
                        <div aria-hidden className="text-muted-foreground relative h-48 font-mono text-[11px] tabular-nums">
                            {ticks.map((tick) => (
                                <span
                                    key={tick}
                                    className="absolute right-0 -translate-y-1/2 leading-none"
                                    style={{ bottom: `${(tick / top) * 100}%` }}
                                >
                                    {tick}
                                </span>
                            ))}
                        </div>
                        <div className="relative h-48">
                            {ticks.map((tick) => (
                                <span
                                    key={tick}
                                    aria-hidden
                                    className={cn('absolute inset-x-0 border-t', tick === 0 ? 'border-border' : 'border-border/50 border-dashed')}
                                    style={{ bottom: `${(tick / top) * 100}%` }}
                                />
                            ))}
                            <div aria-hidden className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                                {months.map((m) => (
                                    <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                                        {m.total > 0 && (
                                            <span className="text-foreground mb-0.5 font-mono text-[11px] font-semibold tabular-nums">{m.total}</span>
                                        )}
                                        {/* Bought at the foot, rented on top; a hairline of card between the pieces. */}
                                        <div className="flex w-full max-w-9 flex-col-reverse gap-px" style={{ height: `${(m.total / top) * 100}%` }}>
                                            {SERIES.map((s) =>
                                                m[s.key] > 0 ? (
                                                    <span
                                                        key={s.key}
                                                        className={cn('block w-full first:rounded-b-sm last:rounded-t-sm', s.fill)}
                                                        style={{ flexGrow: m[s.key] }}
                                                    />
                                                ) : null,
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <span />
                        <div aria-hidden className="mt-1.5 flex gap-1 sm:gap-2">
                            {months.map((m, i) => (
                                <span key={m.month} className="text-muted-foreground min-w-0 flex-1 truncate text-center text-[11px]">
                                    {monthLabel(m.month, lang, i === 0 || m.month.endsWith('-01'))}
                                </span>
                            ))}
                        </div>
                    </div>
                    {/* The legend carries each way's total, so no number lives only in a colour. */}
                    <div id={`${titleId}-summary`} className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="sr-only">
                            {t('rep_wo_month_aria')
                                .replace('{from}', monthLabel(months[0].month, lang, false, true))
                                .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                                .replace('{n}', count(total, lang))
                                .replace('{peak}', peakText)}
                        </span>
                        {sums.map((s) => (
                            <Swatch key={s.key} fill={s.fill}>
                                {t(s.label)}
                                <b className="text-foreground font-mono font-semibold tabular-nums">{count(s.n, lang)}</b>
                            </Swatch>
                        ))}
                    </div>
                    {/* Every month's numbers for a screen reader (the chart itself is one image). */}
                    <table className="sr-only">
                        <caption>{t('rep_wo_month_title')}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{t('rep_wo_month_col')}</th>
                                {SERIES.map((s) => (
                                    <th key={s.key} scope="col">
                                        {t(s.label)}
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
                sub={reasons.length > 0 ? t('rep_wo_reason_count').replace('{n}', String(reasons.length)) : undefined}
            />
            {reasons.length === 0 ? (
                <Empty>{t('rep_wo_empty')}</Empty>
            ) : (
                <>
                    <ul className="space-y-3 px-5 py-4">
                        {shown.map((r) => (
                            <li key={r.key} className="min-w-0">
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className={cn('truncate', r.key === 'none' && 'text-muted-foreground')} title={name(r)}>
                                        {name(r)}
                                    </span>
                                    <b className="font-mono font-semibold tabular-nums">{count(r.total, lang)}</b>
                                </div>
                                <div aria-hidden className="bg-muted mt-1 flex h-2 gap-px overflow-hidden rounded-full">
                                    {r.bought > 0 && (
                                        <span className={cn('block h-full', SERIES[0].fill)} style={{ width: `${(r.bought / max) * 100}%` }} />
                                    )}
                                    {r.rented > 0 && (
                                        <span className={cn('block h-full', SERIES[1].fill)} style={{ width: `${(r.rented / max) * 100}%` }} />
                                    )}
                                </div>
                                {/* The split in words, so the two colours are never the only way to tell. */}
                                <div className="text-muted-foreground mt-0.5 flex gap-x-3 text-[11px]">
                                    {r.bought > 0 && (
                                        <span>
                                            {t('rep_src_purchased')} {count(r.bought, lang)}
                                        </span>
                                    )}
                                    {r.rented > 0 && (
                                        <span>
                                            {t('rep_src_rented')} {count(r.rented, lang)}
                                        </span>
                                    )}
                                </div>
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
            <div aria-hidden className="bg-muted flex h-2 gap-px overflow-hidden rounded-full">
                {BANDS.map((b) =>
                    bands[b.key] > 0 ? (
                        <span key={b.key} className={cn('block h-full', b.fill)} style={{ width: `${(bands[b.key] / sum) * 100}%` }} />
                    ) : null,
                )}
            </div>
            {/* Each band's count in words beside its colour. */}
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums">
                {BANDS.map((b) => (
                    <span key={b.key} className={cn(bands[b.key] === 0 && 'opacity-60')}>
                        {t('rep_wo_band_count').replace('{band}', t(b.label)).replace('{n}', String(bands[b.key]))}
                    </span>
                ))}
            </div>
        </div>
    );
}

function CategoryCard({ categories }: { categories: Category[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const label = (c: Category) => (c.name === null ? t('rep_wo_no_category') : (lang === 'th' && c.name_th) || c.name);

    return (
        <Card className="overflow-hidden">
            <CardTitle
                title={t('rep_wo_cat_title')}
                note={t('rep_wo_cat_sub')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {BANDS.map((b) => (
                            <Swatch key={b.key} fill={b.fill}>
                                {t(b.label)}
                            </Swatch>
                        ))}
                    </span>
                }
            />
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
                                                    {t('rep_wo_years_n').replace('{n}', years(c.avg_age_years, lang))}
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
                        <Swatch fill={SERIES[1].fill}>{t('rep_wo_ct_col_returned')}</Swatch>
                        <Swatch fill="bg-muted-foreground/35">{t('rep_wo_ct_col_out')}</Swatch>
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
                                const percent = c.units === 0 ? 0 : (c.returned / c.units) * 100;
                                return (
                                    <tr key={c.id} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                            {canOpen(href) ? (
                                                <Link
                                                    to={href}
                                                    className="focus-visible:ring-brand rounded-sm font-mono text-xs font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                                                >
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
                                        <td className={cn(TD, 'whitespace-nowrap')}>{dayLabel(c.end_date, lang)}</td>
                                        <td className={cn(TD, NUM)}>{count(c.units, lang)}</td>
                                        <td className={cn(TD, NUM, c.returned === 0 && 'text-muted-foreground')}>{count(c.returned, lang)}</td>
                                        <td
                                            className={cn(
                                                TD,
                                                NUM,
                                                c.written_off_other > 0
                                                    ? 'font-semibold text-amber-800 dark:text-amber-300'
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
                                                <div aria-hidden className="bg-muted-foreground/35 flex h-2 overflow-hidden rounded-full">
                                                    {c.returned > 0 && (
                                                        <span className={cn('block h-full', SERIES[1].fill)} style={{ width: `${percent}%` }} />
                                                    )}
                                                </div>
                                                <div className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                                                    {t('rep_wo_ct_progress')
                                                        .replace('{x}', count(c.returned, lang))
                                                        .replace('{y}', count(c.units, lang))}
                                                </div>
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
            <CategoryCard categories={data.categories} />
            <ContractCard contracts={data.contracts} />
        </div>
    );
}
