// "ต่ออายุและสิ้นสุดสัญญา" report: tiles, ending-by-month chart, time-left bands, the list's own cells and the closed-contracts card
// (data: useContractRenewalsBreakdown).
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { InfoPopover } from '@/shared/components/info-popover';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { formatNumber } from '@/shared/lib/number';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { useContractRenewalsBreakdown } from '../hooks/use-reports';
import type { ChartTone, ContractClosedRange, ContractClosedRow, ContractRenewalBand, ContractRenewalsBreakdown, TabularFilters } from '../types';
import { Segments } from './access-overview-cards';
import { CardTitle, CardEmpty as Empty, FoldToggle, InfoMark, rich, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { ContractCode, ContractNameCell, TypePill } from './contract-cells';
import { ContractLeftPill } from './contract-left-pill';
import { compactMoney, contractMoney, ContractMonthCard } from './contract-month-card';
import { CONTRACT_TYPE_TONE, CONTRACT_TYPES, type ContractTypeKey } from './contract-tones';
import { KpiTile } from './kpi-tile';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, KpiRowSkeleton, TableRowsSkeleton } from './report-skeletons';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type T = (key: string) => string;
type Lang = 'th' | 'en';
type Patch = (next: TabularFilters) => void;
type Row = Record<string, unknown>;

const DEFAULT_WINDOW = 90;

const WINDOWS = [30, 60, 90, 180, 365];

/** Closed rows shown before "แสดงทั้งหมด". */
const CLOSED_FOLD = 10;

/** Ended this many days after the end date reads late (red). */
const LATE_DAYS = 7;

/** Each band by urgency: overdue red, within 30 days amber, then blue as the pill shows a running contract (softer past 180). */
const BAND_TONE: Record<ContractRenewalBand, ChartTone> = {
    overdue: 'red',
    d30: 'amber',
    d90: 'blue',
    d180: 'blue',
    d365: 'soft-blue',
    later: 'soft-blue',
};

const CLOSED_RANGES: ContractClosedRange[] = ['year', '12m', 'all'];

const TODO_TONE = {
    bad: 'font-semibold text-red-700 dark:text-red-400',
    warn: 'font-semibold text-amber-800 dark:text-amber-300',
    plain: 'text-foreground',
    muted: 'text-muted-foreground',
} as const;

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-top';

const count = (n: number, lang: Lang) => formatNumber(n, lang);

/** The window a link asks for, or the default when it names one the filter does not offer. */
export const windowOf = (filters: TabularFilters) => {
    const within = Number(filters.within ?? DEFAULT_WINDOW);
    return WINDOWS.includes(within) ? within : DEFAULT_WINDOW;
};

/** "90 วัน" / "1 ปี" — the window as its option reads. */
const windowText = (t: T, within: number) => t(`rep_opt_${within}d`);

/** A contract's master-data name in the reader's language. */

/* ─────────────────────────── tiles ─────────────────────────── */

function Tiles({ data }: { data: ContractRenewalsBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { within, soon, overdue, files, closed_year: closed } = data.tiles;
    const unit = t('rep_cren_unit');
    const withFile = files.open - files.missing;

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t('rep_cren_k_within').replace('{w}', windowText(t, data.within))}
                value={count(within.count, lang)}
                unit={unit}
                footer={within.count > 0 ? rich(t('rep_cren_per_year'), { v: contractMoney(within.yearly, lang) }) : t('rep_cren_k_within_none')}
            />
            <KpiTile
                label={t('rep_cren_k_soon')}
                value={count(soon.count, lang)}
                unit={unit}
                alert={soon.count > 0 ? 'amber' : undefined}
                footer={
                    soon.nearest
                        ? rich(t('rep_cren_k_soon_foot'), {
                              code: <span translate="no">{soon.nearest.code}</span>,
                              n: count(soon.nearest.days, lang),
                          })
                        : t('rep_cren_k_soon_none')
                }
            />
            <KpiTile
                label={t('rep_cren_k_overdue')}
                value={count(overdue.count, lang)}
                unit={unit}
                alert={overdue.count > 0 ? 'red' : undefined}
                footer={
                    overdue.oldest
                        ? rich(t('rep_cren_k_overdue_foot'), {
                              code: <span translate="no">{overdue.oldest.code}</span>,
                              n: count(overdue.oldest.days, lang),
                          })
                        : t('rep_cren_k_overdue_none')
                }
            />
            <KpiTile
                label={t('rep_cren_k_files')}
                hint={t('rep_cren_k_files_hint')}
                value={count(files.missing, lang)}
                unit={t('rep_cren_k_files_of').replace('{n}', count(files.open, lang))}
                bar={
                    files.open > 0
                        ? [
                              {
                                  key: 'missing',
                                  percent: (files.missing / files.open) * 100,
                                  className: FILL.amber,
                                  title: `${t('rep_cren_files_no')}: ${count(files.missing, lang)}`,
                              },
                              {
                                  key: 'has',
                                  percent: (withFile / files.open) * 100,
                                  className: FILL.green,
                                  title: `${t('rep_cren_files_yes')}: ${count(withFile, lang)}`,
                              },
                          ]
                        : undefined
                }
                footer={files.open > 0 && files.missing === files.open ? t('rep_cren_k_files_all') : t('rep_cren_k_files_foot')}
            />
            <KpiTile
                label={t('rep_cren_k_closed')}
                value={count(closed.count, lang)}
                unit={unit}
                footer={rich(t('rep_cren_k_closed_foot'), { c: count(closed.cancelled, lang), e: count(closed.expired, lang) })}
            />
        </div>
    );
}

/* ─────────────────────────── time left ─────────────────────────── */

type Band = ContractRenewalsBreakdown['bands'][number];

/** The band's types with a count, in the /contracts order. */
const typesOf = (band: Band) => CONTRACT_TYPES.filter((k) => band.types[k] > 0);

function BandTip({ band }: { band: Band }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="min-w-44 space-y-1">
            <div className="font-semibold">
                {t('rep_cren_band_tip')
                    .replace('{band}', t(`rep_cren_band_${band.key}`))
                    .replace('{n}', count(band.total, lang))}
            </div>
            {typesOf(band).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4">
                    <Swatch fill={FILL[CONTRACT_TYPE_TONE[k]]}>{t(`contract_type_${k}`)}</Swatch>
                    <b className="tabular-nums">{count(band.types[k], lang)}</b>
                </div>
            ))}
        </div>
    );
}

/** One band row: label with its yearly cost under it, one bar on the shared scale, the count. */
function BandRowBody({ band, max }: { band: Band; max: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const late = band.key === 'overdue' && band.total > 0;

    return (
        <>
            <span className={cn('leading-snug', late && 'font-semibold text-red-700 dark:text-red-400')}>
                {t(`rep_cren_band_${band.key}`)}
                <small className="text-muted-foreground block text-[11px] font-normal">
                    {band.total > 0 ? t('rep_cren_per_year').replace('{v}', compactMoney(band.yearly)) : t('rep_cren_band_none')}
                </small>
            </span>
            <span aria-hidden className="dark:bg-muted block h-2.5 overflow-hidden rounded-full bg-slate-200">
                {band.total > 0 && (
                    <span
                        className={cn('block h-full min-w-1 rounded-full', FILL[BAND_TONE[band.key]])}
                        style={{ width: `${(band.total / max) * 100}%` }}
                    />
                )}
            </span>
            <b aria-hidden className={cn('min-w-8 text-right font-semibold tabular-nums', late && 'text-red-700 dark:text-red-400')}>
                {band.total > 0 ? count(band.total, lang) : '—'}
            </b>
        </>
    );
}

const BAND_ROW = 'grid min-h-11 w-full grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm';

function TimeLeftCard({ data }: { data: ContractRenewalsBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const max = Math.max(1, ...data.bands.map((b) => b.total));
    const aria = (band: Band) =>
        t('rep_cren_band_aria')
            .replace('{band}', t(`rep_cren_band_${band.key}`))
            .replace('{n}', count(band.total, lang))
            .replace('{v}', contractMoney(band.yearly, lang))
            .replace(
                '{types}',
                typesOf(band)
                    .map((k: ContractTypeKey) => `${t(`contract_type_${k}`)} ${count(band.types[k], lang)}`)
                    .join(', '),
            );

    return (
        <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <CardTitle title={t('rep_cren_left_title')} sub={t('rep_cren_left_open').replace('{n}', count(data.open_total, lang))} />
            {data.open_total === 0 ? (
                <Empty kind="search" title={t('rep_empty_renewals_time_left')} hint={t('rep_empty_renewals_time_left_hint')} />
            ) : (
                <ul className="space-y-0.5 px-3 py-3">
                    {data.bands.map((band) => (
                        <li key={band.key}>
                            {band.total > 0 ? (
                                <InfoPopover
                                    label={aria(band)}
                                    content={<BandTip band={band} />}
                                    className={cn(BAND_ROW, 'hover:bg-accent/50 cursor-pointer')}
                                >
                                    <BandRowBody band={band} max={max} />
                                </InfoPopover>
                            ) : (
                                <div className={BAND_ROW}>
                                    <BandRowBody band={band} max={max} />
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

/* ─────────────────────────── cards above the list ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <KpiRowSkeleton count={5} className={summaryColumns(5)} />
            <div className="grid gap-3 xl:grid-cols-5">
                <Card className="overflow-hidden xl:col-span-3">
                    <CardHeadingSkeleton />
                    <ChartSkeleton />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={6} />
                </Card>
            </div>
        </div>
    );
}

export function ContractRenewalsCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const { data, isLoading, isError, error } = useContractRenewalsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <Tiles data={data} />
            {/* Side by side from lg; one column on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 xl:grid-cols-5">
                <ContractMonthCard
                    className="xl:col-span-3"
                    title={t('rep_cren_month_title')}
                    info={[t('rep_cren_month_info'), t('rep_cren_month_info_click')]}
                    months={data.months}
                    mode="count"
                    rowValue={(item) => <span className="text-xs">{fmt.date(item.date)}</span>}
                    monthFoot={(month) =>
                        rich(t('rep_cren_month_foot'), {
                            n: count(month.items.length, lang),
                            v: contractMoney(
                                month.items.reduce((sum, item) => sum + item.yearly, 0),
                                lang,
                            ),
                        })
                    }
                    empty={{ title: t('rep_empty_renewals_month'), hint: t('rep_empty_renewals_month_hint') }}
                />
                <TimeLeftCard data={data} />
            </div>
        </div>
    );
}

/* ─────────────────────────── the list's cells ─────────────────────────── */

/** The list row's reminder and to-do figures, from the breakdown the cards already loaded. */
function useListItem(filters: TabularFilters, id: unknown) {
    const { data } = useContractRenewalsBreakdown(filters);
    return data?.list.find((item) => item.id === id) ?? null;
}

function TimeLeftPill({ days, filters, id }: { days: number; filters: TabularFilters; id: unknown }) {
    const item = useListItem(filters, id);
    return <ContractLeftPill days={days} inReminder={!!item?.in_reminder} />;
}

function NameCell({ row }: { row: Row }) {
    return (
        <ContractNameCell
            name={typeof row.name === 'string' ? row.name : null}
            vendor={(row.vendor as { name: string; name_th: string | null } | null) ?? null}
        />
    );
}

function AlertCell({ filters, id }: { filters: TabularFilters; id: unknown }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const item = useListItem(filters, id);
    if (!item) return <span className="text-muted-foreground">—</span>;
    const { alert } = item;
    if (alert.state === 'off') return <span className={TODO_TONE.warn}>{t('rep_cren_alert_off')}</span>;
    const sub =
        alert.state === 'sent' ? (
            t('rep_cren_alert_sent')
                .replace(
                    '{list}',
                    alert.sent.map((d) => (d === 0 ? t('rep_cren_alert_sent_end') : t('rep_cren_alert_days').replace('{d}', fmtN(d)))).join(', '),
                )
                .replace('{at}', fmt.date(alert.sent_at))
        ) : alert.state === 'missed' ? (
            <span className={TODO_TONE.warn}>{t('rep_cren_alert_missed')}</span>
        ) : (
            t('rep_cren_alert_starts').replace('{n}', fmtN(alert.starts_in ?? 0))
        );

    return (
        <div className="min-w-[9rem] whitespace-normal tabular-nums">
            <div>{t('rep_cren_alert_days').replace('{d}', alert.days.join(', '))}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
        </div>
    );
}

/** Fixed rules in order: overdue, rented to return, bought to decide on, in reminder, not yet; extra lines muted. */
function TodoCell({ filters, id, days }: { filters: TabularFilters; id: unknown; days: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const item = useListItem(filters, id);
    if (!item) return <span className="text-muted-foreground">—</span>;
    const { todo } = item;
    const n = (value: number) => count(value, lang);
    const main: { text: string; tone: keyof typeof TODO_TONE } =
        todo.main === 'overdue'
            ? { text: t('rep_cren_todo_overdue').replace('{n}', n(-days)), tone: 'bad' }
            : todo.main === 'today'
              ? { text: t('rep_cren_todo_today'), tone: 'bad' }
              : todo.main === 'return_rent'
                ? { text: t('rep_cren_todo_return_rent').replace('{n}', n(todo.rented)), tone: 'warn' }
                : todo.main === 'decide_ma'
                  ? { text: t('rep_cren_todo_decide_ma').replace('{n}', n(todo.bought)), tone: 'warn' }
                  : todo.main === 'contact'
                    ? { text: t('rep_cren_todo_contact'), tone: 'plain' }
                    : { text: t('rep_cren_todo_not_yet'), tone: 'muted' };
    const extra = [
        days <= 0 && todo.rented > 0 ? t('rep_cren_todo_rent_left').replace('{n}', n(todo.rented)) : null,
        todo.held > 0 ? t('rep_cren_todo_held').replace('{n}', n(todo.held)) : null,
    ].filter((line): line is string => line !== null);

    return (
        <div className="max-w-[18rem] min-w-[12rem] text-[13px] whitespace-normal tabular-nums">
            <div className={TODO_TONE[main.tone]}>{main.text}</div>
            {extra.map((line) => (
                <div key={line} className="text-muted-foreground mt-0.5 text-xs">
                    {line}
                </div>
            ))}
        </div>
    );
}

/** The page's own cells of the list; undefined leaves a column to the shared TabularCell. */
export function renewalsCell(key: string, row: Row, { filters }: { filters: TabularFilters }) {
    const days = typeof row.days_left === 'number' ? row.days_left : 0;
    if (key === 'name') return <NameCell row={row} />;
    if (key === 'type') return <TypePill type={row.type} />;
    if (key === 'days_left') return <TimeLeftPill days={days} filters={filters} id={row.id} />;
    if (key === 'alerts') return <AlertCell filters={filters} id={row.id} />;
    if (key === 'todo') return <TodoCell filters={filters} id={row.id} days={days} />;
    return undefined;
}

/** The ⓘ beside the list's heading. */
export function RenewalsRowsInfo() {
    const t = useT();
    return <InfoMark info={[t('rep_cren_rows_info'), t('rep_cren_rows_info_alerts')]} />;
}

/** The list with nothing inside the window: say so, and offer a year. */
export function RenewalsEmpty({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const within = windowOf(filters);

    return (
        <EmptyState kind="search" title={t('rep_empty_renewals_rows').replace('{w}', windowText(t, within))} hint={t('rep_empty_renewals_rows_hint')}>
            {within < 365 && (
                <Button variant="outline" size="sm" onClick={() => patch({ within: 365 })}>
                    <CalendarRange className="h-4 w-4" />
                    {t('rep_cren_empty_widen')}
                </Button>
            )}
        </EmptyState>
    );
}

/* ─────────────────────────── closed contracts ─────────────────────────── */

function ClosedRangeSegments({ active, patch }: { active: ContractClosedRange; patch: Patch }) {
    const t = useT();
    return (
        <span className="flex items-center gap-2">
            <span aria-hidden>{t('rep_cren_fl_closed')}</span>
            <Segments
                size="md"
                label={t('rep_cren_fl_closed')}
                value={active}
                onChange={(range) => patch({ closed: range })}
                options={CLOSED_RANGES.map((range) => ({ value: range, label: t(`rep_cren_closed_${range}`), count: null }))}
            />
        </span>
    );
}

/** Closed against the end date: before, on, or after it (late past a week in red), with the end date under it. */
function VersusEnd({ row }: { row: ContractClosedRow }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const text =
        row.gap < 0
            ? t('rep_cren_vs_before').replace('{n}', count(-row.gap, lang))
            : row.gap > 0
              ? t('rep_cren_vs_after').replace('{n}', count(row.gap, lang))
              : t('rep_cren_vs_same');

    return (
        <div className="whitespace-nowrap">
            {row.gap > LATE_DAYS ? (
                <div className="flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {text}
                    <span className="sr-only">{t('rep_cren_vs_late')}</span>
                </div>
            ) : (
                <div>{text}</div>
            )}
            <div className="text-muted-foreground mt-0.5 text-xs">{t('rep_cren_vs_end').replace('{d}', fmt.date(row.end_date))}</div>
        </div>
    );
}

function ClosedTable({ rows }: { rows: ContractClosedRow[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [open, setOpen] = useState(false);
    const shown = open ? rows : rows.slice(0, CLOSED_FOLD);
    const dash = <span className="text-muted-foreground">—</span>;

    return (
        <>
            <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                    <caption className="sr-only">{t('rep_cren_closed_caption')}</caption>
                    <thead>
                        <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_c_code')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_c_name')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_cren_col_kind')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_cren_col_closed_at')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_cren_col_vs_end')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-right')}>
                                {t('rep_cren_col_unpaid')}
                            </th>
                            <th scope="col" className={cn(TH, 'text-left')}>
                                {t('rep_cren_col_reason')}
                            </th>
                            <th scope="col" className={cn(TH, 'hidden text-left lg:table-cell')}>
                                {t('rep_cren_col_by')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((row) => {
                            return (
                                <tr key={row.id} className="border-border/60 border-b last:border-b-0">
                                    <td className={cn(TD, 'whitespace-nowrap')}>
                                        <ContractCode id={row.id} code={row.code} />
                                    </td>
                                    <td className={TD}>
                                        <ContractNameCell name={row.name} vendor={row.vendor} />
                                    </td>
                                    <td className={cn(TD, 'whitespace-nowrap')}>
                                        <StatusBadge tone="gray">
                                            {t(row.kind === 'cancelled' ? 'contract_cancelled' : 'contract_expired')}
                                        </StatusBadge>
                                    </td>
                                    <td className={cn(TD, 'text-xs whitespace-nowrap')}>{fmt.date(row.closed_at)}</td>
                                    <td className={TD}>
                                        <VersusEnd row={row} />
                                    </td>
                                    <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>
                                        {row.unpaid > 0 ? contractMoney(row.unpaid, lang) : dash}
                                    </td>
                                    <td className={cn(TD, 'max-w-[18rem] min-w-[10rem] whitespace-normal')}>{row.reason ?? dash}</td>
                                    <td className={cn(TD, 'hidden whitespace-nowrap lg:table-cell')}>{row.by ?? dash}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {rows.length > CLOSED_FOLD && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
        </>
    );
}

/** Under the list: contracts cancelled or ended, in the card's own "ปิดเมื่อ" range (in the URL as ?closed=). */
export function ClosedContractsCard({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading, isError, error } = useContractRenewalsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) {
        return (
            <Card className="overflow-hidden" aria-hidden>
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={4} />
            </Card>
        );
    }

    const { closed } = data;
    const info =
        closed.rows.length === 0
            ? [t('rep_cren_closed_none')]
            : [
                  t('rep_cren_closed_sum').replace('{c}', count(closed.cancelled, lang)).replace('{e}', count(closed.expired, lang)),
                  ...(closed.unpaid > 0 ? [t('rep_cren_closed_unpaid').replace('{v}', contractMoney(closed.unpaid, lang))] : []),
              ];

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_cren_closed_title')} info={info} sub={<ClosedRangeSegments active={closed.range} patch={patch} />} />
            {closed.rows.length === 0 ? (
                <Empty kind="empty" title={t('rep_empty_renewals_closed')} hint={t('rep_empty_renewals_closed_hint')} />
            ) : (
                <ClosedTable key={closed.range} rows={closed.rows} />
            )}
        </Card>
    );
}
