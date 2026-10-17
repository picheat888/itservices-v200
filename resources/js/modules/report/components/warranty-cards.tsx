// Warranty report cards: soon / expired segments, by month, time left, by category and by vendor (data: useAssetWarrantyBreakdown).
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useAssetWarrantyBreakdown } from '../hooks/use-reports';
import type { AssetWarrantyBreakdown, ChartTone, TabularFilters, WarrantyGroupFigures, WarrantyStatus } from '../types';
import { type BarPiece, barTop, CardTitle, CODE_LINK, CountBar, CardEmpty as Empty, monthLabel, shortYear, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { formatLiveNumber } from './report-scope';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, TableRowsSkeleton } from './report-skeletons';
import { DaysLeftBadge } from './tabular-cell';
import { ErrorCard, errorMessageFor } from './tabular-report-view';
import { niceMax } from './weekly-ticket-chart';

type T = (key: string) => string;
type Lang = 'th' | 'en';
type Patch = (next: TabularFilters) => void;
type Month = AssetWarrantyBreakdown['months'][number];
type Category = AssetWarrantyBreakdown['categories'][number];
type Vendor = AssetWarrantyBreakdown['vendors'][number];
type Period = keyof WarrantyGroupFigures['periods'];

/** Where the asset is now, in the order and colours of Settings → Assets. */
const STATUSES: { key: WarrantyStatus; label_key: string; tone: ChartTone }[] = [
    { key: 'ready', label_key: 'asset_ready', tone: 'asset-ready' },
    { key: 'deployed', label_key: 'asset_deployed', tone: 'asset-deployed' },
    { key: 'common', label_key: 'asset_common', tone: 'asset-common' },
    { key: 'pending_acceptance', label_key: 'asset_pending_accept', tone: 'asset-pending-acceptance' },
    { key: 'pending_return', label_key: 'asset_pending_return', tone: 'asset-pending-return' },
];

/** The period tables' colours: expired red, in the window amber (amber = warranty), to a year blue, beyond green. */
const PERIOD_TONES: Record<Period, ChartTone> = { expired: 'soft-red', within: 'soft-amber', mid: 'soft-blue', later: 'soft-green' };

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle';
const NUM = 'text-right tabular-nums';

const count = (n: number, lang: Lang) => formatNumber(n, lang);

/** "90 วัน" / "1 ปี" — the "ภายใน" window as its option reads. */
const windowText = (t: T, within: number) => t(`rep_opt_${within}d`);

/** The period set both tables share; the middle one drops out for a year-long window. */
function periodPieces(t: T, within: number, periods: WarrantyGroupFigures['periods']): BarPiece[] {
    const keys: Period[] = within < 365 ? ['expired', 'within', 'mid', 'later'] : ['expired', 'within', 'later'];
    return keys.map((key) => ({
        key,
        tone: PERIOD_TONES[key],
        value: periods[key],
        label: t(`rep_wty_period_${key}`)
            .replace('{w}', windowText(t, within))
            .replace('{from}', formatLiveNumber(within + 1)),
    }));
}

function statusPieces(t: T, statuses: Record<WarrantyStatus, number>, shown = STATUSES): BarPiece[] {
    return shown.map((s) => ({ key: s.key, label: t(s.label_key), tone: s.tone, value: statuses[s.key] }));
}

/** Statuses any of these counts uses — the rest stay out of the legend and the bars. */
function usedStatuses(sets: Record<WarrantyStatus, number>[]) {
    return STATUSES.filter((s) => sets.some((set) => set[s.key] > 0));
}

/** A heading-right legend: a dot per piece, optionally with its count. */
function Legend({ pieces, counts }: { pieces: Omit<BarPiece, 'value'>[]; counts?: Record<string, number> }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {pieces.map((p) => (
                <Swatch key={p.key} fill={FILL[p.tone]}>
                    {p.label}
                    {counts && <b className="text-foreground font-semibold tabular-nums">{count(counts[p.key] ?? 0, lang)}</b>}
                </Swatch>
            ))}
        </span>
    );
}

/** Scroll the page to the list under the cards, without motion when the reader asks for none. */
function scrollToRows() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('report-rows')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

/* ─────────────────────────── soon / expired segments ─────────────────────────── */

const SEGMENTS = [
    { value: 'soon', label: 'rep_wty_state_soon', period: 'within' },
    { value: 'expired', label: 'rep_wty_state_expired', period: 'expired' },
] as const;

/** Beside the rows card's heading: the list shows assets expiring in the window, or already expired. */
export function WarrantyStateSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data } = useAssetWarrantyBreakdown(filters);
    const active = filters.state === 'expired' ? 'expired' : 'soon';

    return (
        <div
            role="group"
            aria-label={t('rep_fl_wty_state')}
            className="border-border bg-card dark:bg-background inline-flex gap-0.5 rounded-md border p-0.5"
        >
            {SEGMENTS.map((s) => (
                <button
                    key={s.value}
                    type="button"
                    aria-pressed={active === s.value}
                    onClick={() => patch({ state: s.value })}
                    className={cn(
                        'focus-visible:ring-brand focus-visible:ring-offset-background inline-flex h-6 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                        active === s.value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    {t(s.label)}
                    {data && <span>{count(data.category_totals?.periods[s.period] ?? 0, lang)}</span>}
                </button>
            ))}
        </div>
    );
}

/* ─────────────────────────── month chart ─────────────────────────── */

function MonthCard({ months }: { months: Month[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const bars = useRef(new Map<string, HTMLElement>());
    const used = usedStatuses(months.map((m) => m.statuses));
    const total = months.reduce((sum, m) => sum + m.total, 0);
    const peak = months.reduce<Month | null>((best, m) => (m.total > (best?.total ?? 0) ? m : best), null);
    const top = niceMax(peak?.total ?? 0);
    const ticks = [0, top / 2, top];
    const minorTicks = [top / 4, (top * 3) / 4];
    const at = (v: number) => ({ bottom: `${(v / top) * 100}%` });
    const counts = Object.fromEntries(used.map((s) => [s.key, months.reduce((sum, m) => sum + m.statuses[s.key], 0)]));
    const thisMonth = months[0]?.month;
    const peakText = peak
        ? t('rep_wty_month_peak')
              .replace('{month}', monthLabel(peak.month, lang, false, true))
              .replace('{n}', count(peak.total, lang))
        : '';
    const monthText = (m: Month) =>
        [
            monthLabel(m.month, lang, false, true),
            ...used.filter((s) => m.statuses[s.key] > 0).map((s) => `${t(s.label_key)} ${count(m.statuses[s.key], lang)}`),
            `${t('rep_wty_month_total')} ${count(m.total, lang)}`,
        ].join(', ');

    return (
        <Card className="flex flex-col overflow-hidden lg:col-span-2 xl:col-span-3">
            <CardTitle
                title={t('rep_wty_month_title')}
                info={peak ? peakText : undefined}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Legend pieces={statusPieces(t, counts as Record<WarrantyStatus, number>, used)} counts={counts} />
                        <span className="inline-flex items-center gap-1.5">
                            <i aria-hidden className="border-brand inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed" />
                            {t('rep_wty_month_now')}
                        </span>
                    </span>
                }
            />
            {total === 0 ? (
                <Empty kind="empty" title={t('rep_empty_warranty_month')} hint={t('rep_empty_warranty_month_hint')} />
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_wty_month_aria')
                            .replace('{from}', monthLabel(months[0].month, lang, false, true))
                            .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                            .replace('{n}', count(total, lang))}{' '}
                        {months
                            .filter((m) => m.total > 0)
                            .map(monthText)
                            .join('; ')}
                    </p>
                    <div className="flex min-h-56 flex-1 gap-2">
                        <div aria-hidden className="w-6 shrink-0 pt-[22px] pb-9">
                            <div className="relative h-full">
                                {ticks.map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 translate-y-1/2 text-[10.5px] leading-none tabular-nums"
                                        style={at(v)}
                                    >
                                        {count(v, lang)}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="border-border relative mt-[22px] flex-1 border-b">
                                <div aria-hidden>
                                    {ticks.slice(1).map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t" style={at(v)} />
                                    ))}
                                    {minorTicks.map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={at(v)} />
                                    ))}
                                </div>
                                <div className="absolute inset-0 flex items-end gap-1 sm:gap-2.5">
                                    {months.map((m) => (
                                        <InfoPopover
                                            key={m.month}
                                            label={monthText(m)}
                                            anchor={() => barTop(bars.current.get(m.month), m.total > 0 ? 18 : 0)}
                                            className="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end"
                                            content={<MonthDetail month={m} used={used} />}
                                        >
                                            <span
                                                ref={(el) => {
                                                    if (el) bars.current.set(m.month, el);
                                                    else bars.current.delete(m.month);
                                                }}
                                                aria-hidden
                                                className="relative block w-full max-w-8"
                                                style={{ height: `${(m.total / top) * 100}%` }}
                                            >
                                                {m.month === thisMonth && m.total > 0 && (
                                                    <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                )}
                                                {m.total > 0 && (
                                                    <span
                                                        className={cn(
                                                            'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
                                                            m.month === thisMonth && 'text-brand',
                                                        )}
                                                    >
                                                        {count(m.total, lang)}
                                                    </span>
                                                )}
                                                <span className="flex h-full flex-col-reverse gap-px overflow-hidden rounded-t-md">
                                                    {used.map((s) =>
                                                        m.statuses[s.key] > 0 ? (
                                                            <span
                                                                key={s.key}
                                                                className={cn('block min-h-px w-full basis-0', FILL[s.tone])}
                                                                style={{ flexGrow: m.statuses[s.key] }}
                                                            />
                                                        ) : null,
                                                    )}
                                                </span>
                                            </span>
                                        </InfoPopover>
                                    ))}
                                </div>
                            </div>
                            <div aria-hidden className="flex h-9 shrink-0 gap-1 pt-1.5 sm:gap-2.5">
                                {months.map((m) => (
                                    <div key={m.month} className="relative min-w-0 flex-1">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center text-[10.5px] whitespace-nowrap">
                                            <b className={cn('block font-semibold', m.month === thisMonth ? 'text-brand' : 'text-foreground')}>
                                                {monthLabel(m.month, lang, false)}
                                            </b>
                                            <span className="text-muted-foreground tabular-nums">{shortYear(m.month, lang)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

/** A month's popover: its name, each status's count and the total. */
function MonthDetail({ month, used }: { month: Month; used: typeof STATUSES }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {used
                .filter((s) => month.statuses[s.key] > 0)
                .map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-4">
                        <Swatch fill={FILL[s.tone]}>{t(s.label_key)}</Swatch>
                        <b className="tabular-nums">{count(month.statuses[s.key], lang)}</b>
                    </div>
                ))}
            <div className="border-border flex items-center justify-between gap-4 border-t pt-1">
                <span>{t('rep_wty_month_total')}</span>
                <b className="tabular-nums">{count(month.total, lang)}</b>
            </div>
        </div>
    );
}

/* ─────────────────────────── time left ─────────────────────────── */

function TimeLeftCard({ bands }: { bands: AssetWarrantyBreakdown['bands'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const used = usedStatuses(bands.map((b) => b.statuses));
    const total = bands.reduce((sum, b) => sum + b.total, 0);
    const max = Math.max(1, ...bands.map((b) => b.total));
    const expired = bands.find((b) => b.key === 'expired');
    const inStore = expired?.statuses.ready ?? 0;
    const returning = bands.filter((b) => b.key !== 'expired' && b.key !== 'later').reduce((sum, b) => sum + b.statuses.pending_return, 0);
    const notes = [
        expired && expired.total > 0
            ? inStore === expired.total
                ? t('rep_wty_left_expired_all').replace('{n}', count(expired.total, lang))
                : t('rep_wty_left_expired_some').replace('{n}', count(expired.total, lang)).replace('{store}', count(inStore, lang))
            : null,
        returning > 0 ? t('rep_wty_left_returning').replace('{n}', count(returning, lang)) : null,
    ].filter((line): line is string => line !== null);

    return (
        <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <CardTitle
                title={t('rep_wty_left_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Legend pieces={used.map((s) => ({ key: s.key, label: t(s.label_key), tone: s.tone }))} />
                        <span>| {t('rep_wty_units').replace('{n}', count(total, lang))}</span>
                    </span>
                }
            />
            {total === 0 ? (
                <Empty kind="search" title={t('rep_empty_warranty_time_left')} hint={t('rep_empty_warranty_time_left_hint')} />
            ) : (
                <>
                    <ul className="space-y-3 px-5 py-4">
                        {bands.map((b) => (
                            <li key={b.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                                <span
                                    className={cn(
                                        'leading-snug',
                                        b.key === 'expired' && b.total > 0 && 'font-semibold text-red-700 dark:text-red-400',
                                    )}
                                >
                                    {t(`rep_wty_band_${b.key}`)}
                                </span>
                                <CountBar pieces={statusPieces(t, b.statuses, used)} scale={max} />
                                <b className="min-w-8 text-right font-semibold tabular-nums">{count(b.total, lang)}</b>
                            </li>
                        ))}
                    </ul>
                    {notes.length > 0 && (
                        <div className="border-border/60 text-muted-foreground mt-auto space-y-1 border-t px-5 py-3 text-xs">
                            {notes.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── categories ─────────────────────────── */

/** The asset due soonest in the window, and a button that lists the rest of them below. */
function NearestCell({ row, within, onMore }: { row: WarrantyGroupFigures; within: number; onMore?: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    if (!row.nearest) {
        return (
            <span className="text-muted-foreground">
                {row.next_days === null ? '—' : t('rep_wty_next').replace('{d}', count(row.next_days, lang))}
            </span>
        );
    }
    const href = `/assets?view=${row.nearest.id}`;
    const more =
        row.more_in_window === 0
            ? null
            : row.more_same_day === row.more_in_window
              ? t('rep_wty_more_same_day').replace('{n}', count(row.more_in_window, lang))
              : t('rep_wty_more').replace('{n}', count(row.more_in_window, lang)).replace('{w}', windowText(t, within));

    return (
        <div>
            <div className="flex items-center gap-2">
                {canOpen(href) ? (
                    <Link to={href} className={CODE_LINK} translate="no">
                        {row.nearest.code}
                    </Link>
                ) : (
                    <span className="text-xs font-semibold" translate="no">
                        {row.nearest.code}
                    </span>
                )}
                <DaysLeftBadge value={row.nearest.days_left} />
            </div>
            {more &&
                (onMore ? (
                    <button
                        type="button"
                        onClick={onMore}
                        className="text-muted-foreground hover:text-brand focus-visible:ring-brand mt-0.5 inline-flex items-center gap-0.5 rounded-sm text-xs hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {more}
                        <ChevronRight aria-hidden className="h-3 w-3" />
                    </button>
                ) : (
                    <div className="text-muted-foreground mt-0.5 text-xs">{more}</div>
                ))}
        </div>
    );
}

function CategoryCard({ data, patch }: { data: AssetWarrantyBreakdown; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { categories, category_totals: totals, within } = data;
    const label = (c: Category) => (c.category_id === null ? t('rep_wty_no_category') : localPair(c.name, c.name_th, lang) || '');
    // "และอีก N เครื่อง" narrows the list to that category's assets due in the window.
    const showList = (next: TabularFilters) => {
        patch({ ...next, state: 'soon' });
        scrollToRows();
    };

    return (
        <Card className="overflow-hidden">
            <CardTitle title={t('rep_wty_cat_title')} info={t('rep_wty_cat_sub')} sub={<Legend pieces={periodPieces(t, within, PERIOD_ZERO)} />} />
            {categories.length === 0 ? (
                <Empty kind="search" title={t('rep_empty_warranty_categories')} hint={t('rep_empty_warranty_categories_hint')} />
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_wty_cat_title')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wty_col_category')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wty_col_total')}
                                </th>
                                <th scope="col" className={cn(TH, 'w-1/2 min-w-[18rem] text-left')}>
                                    {t('rep_wty_col_periods')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wty_col_nearest')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((c) => (
                                <tr key={c.category_id ?? 'none'} className="border-border/60 border-b last:border-b-0">
                                    <th scope="row" className={cn(TD, 'text-left font-semibold', c.category_id === null && 'text-muted-foreground')}>
                                        {label(c)}
                                    </th>
                                    <td className={cn(TD, NUM, 'font-semibold')}>{count(c.total, lang)}</td>
                                    <td className={TD}>
                                        <CountBar pieces={periodPieces(t, within, c.periods)} />
                                    </td>
                                    <td className={cn(TD, 'min-w-[14rem] whitespace-nowrap')}>
                                        <NearestCell
                                            row={c}
                                            within={within}
                                            onMore={c.category_id === null ? undefined : () => showList({ category_id: c.category_id })}
                                        />
                                    </td>
                                </tr>
                            ))}
                            {totals && (
                                <tr className="bg-muted/40 font-semibold">
                                    <th scope="row" className={cn(TD, 'text-left')}>
                                        {t('rep_wty_cat_total_row').replace('{n}', count(categories.length, lang))}
                                    </th>
                                    <td className={cn(TD, NUM)}>{count(totals.total, lang)}</td>
                                    <td className={TD}>
                                        <CountBar pieces={periodPieces(t, within, totals.periods)} />
                                    </td>
                                    <td className={cn(TD, 'font-normal whitespace-nowrap')}>
                                        <NearestCell row={totals} within={within} onMore={() => showList({})} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

/** Legend pieces carry no counts. */
const PERIOD_ZERO: WarrantyGroupFigures['periods'] = { expired: 0, within: 0, mid: 0, later: 0 };

/* ─────────────────────────── vendors ─────────────────────────── */

/** Who to call and why, worded from the vendor's figures; the extra lines stand on their own. */
function vendorTodo(t: T, lang: Lang, within: number, v: Vendor): { main: string; tone: 'bad' | 'warn' | 'muted'; extra: string[] } {
    const extra: string[] = [];
    const expired = v.periods.expired > 0 ? t('rep_wty_todo_expired').replace('{n}', count(v.periods.expired, lang)) : null;
    if (v.vendor_id === null) {
        if (v.within_year > 0) extra.push(t('rep_wty_todo_year').replace('{n}', count(v.within_year, lang)));
        if (expired) extra.push(expired);
        return { main: t('rep_wty_todo_no_vendor'), tone: 'bad', extra };
    }
    if (expired) extra.push(expired);
    if (v.nearest) {
        return {
            main: t('rep_wty_todo_due')
                .replace('{w}', windowText(t, within))
                .replace('{n}', count(v.periods.within, lang))
                .replace('{d}', count(v.nearest.days_left, lang)),
            tone: 'warn',
            extra,
        };
    }
    if (v.next_days !== null) return { main: t('rep_wty_next').replace('{d}', count(v.next_days, lang)), tone: 'muted', extra };
    return { main: t('rep_wty_todo_none'), tone: 'muted', extra };
}

const TODO_TONE = {
    bad: 'text-red-700 dark:text-red-400 font-semibold',
    warn: 'text-amber-800 dark:text-amber-300 font-semibold',
    muted: 'text-muted-foreground',
} as const;

function VendorCard({ data }: { data: AssetWarrantyBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { vendors, within } = data;

    return (
        <Card className="overflow-hidden">
            <CardTitle
                title={t('rep_wty_vendor_title')}
                info={t('rep_wty_vendor_sub')}
                sub={<Legend pieces={periodPieces(t, within, PERIOD_ZERO)} />}
            />
            {vendors.length === 0 ? (
                <Empty kind="search" title={t('rep_empty_warranty_vendors')} hint={t('rep_empty_warranty_vendors_hint')} />
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_wty_vendor_title')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wty_col_vendor')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_wty_col_total')}
                                </th>
                                <th scope="col" className={cn(TH, 'w-1/2 min-w-[18rem] text-left')}>
                                    {t('rep_wty_col_periods')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_wty_col_todo')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((v) => {
                                const todo = vendorTodo(t, lang, within, v);
                                const name = v.vendor_id === null ? t('rep_wty_no_vendor') : localPair(v.name, v.name_th, lang) || '';
                                // Assets with no vendor sit apart, under a dashed rule.
                                const apart = v.vendor_id === null && vendors.length > 1;
                                return (
                                    <tr
                                        key={v.vendor_id ?? 'none'}
                                        className={cn('border-border/60 border-b last:border-b-0', apart && 'border-border border-t-2 border-dashed')}
                                    >
                                        <th scope="row" className={cn(TD, 'text-left font-normal', v.vendor_id === null && 'text-muted-foreground')}>
                                            <div className="max-w-[12rem] truncate" title={name}>
                                                {name}
                                            </div>
                                        </th>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{count(v.total, lang)}</td>
                                        <td className={TD}>
                                            <CountBar pieces={periodPieces(t, within, v.periods)} />
                                        </td>
                                        <td className={cn(TD, 'min-w-[16rem] text-[13px]')}>
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
                <TableRowsSkeleton rows={4} />
            </Card>
        </div>
    );
}

export function WarrantyCards({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data, isLoading, isError, error } = useAssetWarrantyBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <MonthCard months={data.months} />
                <TimeLeftCard bands={data.bands} />
            </div>
            <CategoryCard data={data} patch={patch} />
            <VendorCard data={data} />
        </div>
    );
}
