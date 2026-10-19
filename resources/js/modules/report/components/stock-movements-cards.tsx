// Stock in & out report cards: tiles, monthly flow, waiting requests, top requesters and departments, count variance (data: useStockMovementsBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localName } from '@/shared/lib/local-name';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useRef, useState } from 'react';
import { useStockMovementsBreakdown } from '../hooks/use-reports';
import type { StockMovementsBreakdown, StockWaitingRequest, TabularFilters } from '../types';
import { Segments } from './access-overview-cards';
import { CardsUpdating } from './cards-updating';
import { CardEmpty, CardTitle, fold, FoldToggle, InfoMark, Sparkline } from './chart-parts';
import { FILL, TEXT } from './chart-tones';
import { KpiTile } from './kpi-tile';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, KpiRowSkeleton, TableRowsSkeleton } from './report-skeletons';
import { StockFlowCard } from './stock-flow-card';
import { daysBetween, MV_TONE, SIGN_INK, signedCount, signedMoney, stockCount, stockMoney, TileFoot } from './stock-parts';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Tiles = StockMovementsBreakdown['tiles'];
type Months = StockMovementsBreakdown['months'];
type FlowType = 'receive' | 'issue' | 'return' | 'transfer';
type Requests = NonNullable<StockMovementsBreakdown['requests']>;
type People = NonNullable<StockMovementsBreakdown['people']>;
type Departments = NonNullable<StockMovementsBreakdown['departments']>;
type Counts = NonNullable<StockMovementsBreakdown['counts']>;
type SortBy = 'value' | 'qty' | 'times';

/** Waiting requests listed before the rest fold. */
const WAITING_SHOWN = 5;

/** Ranked rows before the rest join one row. */
const RANKS_SHOWN = 10;

/** Count rows listed before the rest fold. */
const COUNTS_SHOWN = 10;

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle whitespace-nowrap';
const NUM = 'text-right tabular-nums';
const TRACK = 'dark:bg-muted block h-2.5 overflow-hidden rounded-full bg-slate-200';

/* ─────────────────────────── tiles ─────────────────────────── */

/** A movement type's 12-month line in its colour; none when every month is empty. */
function FlowSpark({ months, type }: { months: Months; type: FlowType }) {
    const values = months.map((m) => m[type]);
    if (!values.some((v) => v > 0)) return null;
    return <Sparkline values={values} className={TEXT[MV_TONE[type]]} />;
}

function MovementTiles({ tiles, months }: { tiles: Tiles; months: Months }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const unit = t('rep_smv_unit');
    const n = (v: number) => stockCount(v, lang);
    const money = (v: number) => stockMoney(v, lang);
    const adjust = tiles.adjust_up.qty - tiles.adjust_down.qty;
    const foot = (template: string, bold: Record<string, string>) => <TileFoot template={template} bold={bold} />;
    const flow = (type: FlowType) => ({
        dot: FILL[MV_TONE[type]],
        value: n(tiles[type].qty),
        unit,
        side: <FlowSpark months={months} type={type} />,
    });

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t('stock_mv_receive')}
                badge={<InfoMark info={[t('rep_info_stock_movements_receive_qty'), t('rep_info_stock_movements_receive_value')]} />}
                {...flow('receive')}
                footer={foot('rep_smv_k_receive_foot', { amount: money(tiles.receive.value) })}
            />
            <KpiTile
                label={t('stock_mv_issue')}
                badge={<InfoMark info={[t('rep_info_stock_movements_issue_qty'), t('rep_info_stock_movements_issue_value')]} />}
                {...flow('issue')}
                footer={foot('rep_smv_k_issue_foot', { amount: money(tiles.issue.value), n: n(tiles.issue.times) })}
            />
            <KpiTile
                label={t('stock_mv_return')}
                badge={<InfoMark info={t('rep_info_stock_movements_return_qty')} />}
                {...flow('return')}
                footer={foot('rep_smv_k_return_foot', { n: n(tiles.return.times), amount: money(tiles.return.value) })}
            />
            <KpiTile
                label={t('stock_mv_transfer')}
                badge={<InfoMark info={t('rep_info_stock_movements_transfer_qty')} />}
                {...flow('transfer')}
                footer={foot('rep_smv_k_transfer_foot', { n: n(tiles.transfer.times) })}
            />
            <KpiTile
                label={t('rep_smv_k_adjust')}
                value={signedCount(adjust, lang)}
                unit={unit}
                tone={adjust < 0 ? 'red' : adjust > 0 ? 'green' : undefined}
                alert={adjust < 0 ? 'red' : undefined}
                badge={
                    <>
                        {adjust < 0 ? <StatusBadge tone="red">{t('rep_smv_k_net_down')}</StatusBadge> : undefined}
                        <InfoMark info={t('rep_info_stock_movements_adjust_net')} />
                    </>
                }
                footer={foot('rep_smv_k_adjust_foot', {
                    up: n(tiles.adjust_up.qty),
                    down: n(tiles.adjust_down.qty),
                    amount: signedMoney(tiles.adjust_up.value - tiles.adjust_down.value, lang),
                })}
            />
        </div>
    );
}

/* ─────────────────────────── waiting requests ─────────────────────────── */

function WaitingRow({ request }: { request: StockWaitingRequest }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const days = request.waiting_since ? daysBetween(request.waiting_since) : 0;
    const tone = days > 7 ? 'red' : days >= 3 ? 'amber' : 'gray';
    const line = t('rep_smv_wait_line')
        .replace('{item}', request.item_name ?? '—')
        .replace('{qty}', stockCount(request.qty, lang))
        .replace(' {unit}', request.unit ? ` ${request.unit}` : '')
        .replace('{who}', localName({ name: request.requester, name_th: request.requester_th }, lang) || '—');

    return (
        <li className="border-border/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t px-5 py-2.5">
            <span className="truncate text-[12.5px] font-semibold">{request.reference ?? '—'}</span>
            <span className="row-span-2">
                <StatusBadge tone={tone} className="tabular-nums">
                    {t(request.status === 'pending' ? 'rep_smv_wait_pending_days' : 'rep_smv_wait_approved_days').replace(
                        '{n}',
                        stockCount(days, lang),
                    )}
                </StatusBadge>
            </span>
            <small className="text-muted-foreground min-w-0 truncate text-xs" title={line}>
                {line}
            </small>
        </li>
    );
}

function WaitingCard({ requests, className }: { requests: Requests; className?: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [open, setOpen] = useState(false);
    const list = useRef<HTMLUListElement>(null);
    const { folds, shown } = fold(requests.rows, WAITING_SHOWN, open);
    const toggle = () => {
        if (open && list.current) list.current.scrollTop = 0;
        setOpen((v) => !v);
    };
    const tiles = [
        { key: 'pending', label: t('stock_rq_pending'), value: requests.pending, edge: 'border-t-amber-500' },
        { key: 'approved', label: t('rep_smv_wait_approved'), value: requests.approved, edge: 'border-t-blue-500' },
    ];

    return (
        <Card className={cn('flex flex-col overflow-hidden', className)}>
            <CardTitle title={t('rep_smv_wait_title')} note={t('rep_smv_wait_as_of').replace('{date}', fmt.date(new Date()))} />
            <ul className="grid grid-cols-2 gap-2 px-5 pt-3.5 pb-2.5">
                {tiles.map((tile) => (
                    <li key={tile.key} className={cn('bg-muted flex flex-col gap-0.5 rounded-lg border-t-[3px] px-3 py-2.5', tile.edge)}>
                        <b className={cn('text-xl leading-tight font-bold tabular-nums', tile.value === 0 && 'text-muted-foreground')}>
                            {stockCount(tile.value, lang)}
                        </b>
                        <span className="text-muted-foreground text-xs">{tile.label}</span>
                    </li>
                ))}
            </ul>
            {requests.rows.length === 0 ? (
                <CardEmpty kind="clear" title={t('rep_empty_stock_movements_waiting')} hint={t('rep_empty_stock_movements_waiting_hint')} />
            ) : (
                <>
                    <ul ref={list} className={cn(open && 'max-h-96 overflow-y-auto overscroll-contain')}>
                        {shown.map((r, i) => (
                            <WaitingRow key={`${r.reference}-${i}`} request={r} />
                        ))}
                    </ul>
                    {folds && <FoldToggle open={open} total={requests.rows.length} onToggle={toggle} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── top requesters and departments ─────────────────────────── */

const SORTS: SortBy[] = ['value', 'qty', 'times'];

const sortBy = (value: unknown): SortBy => (SORTS.includes(value as SortBy) ? (value as SortBy) : 'value');

type Patch = (next: TabularFilters) => void;

interface RankRow {
    key: string;
    name: string;
    sub: string;
    value: number;
    qty: number;
    times: number;
}

/** A ranked row's figure in the chosen metric. */
function useFigure(by: SortBy) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (by === 'value') return (v: number) => stockMoney(v, lang);
    if (by === 'qty') return (v: number) => t('rep_smv_pcs').replace('{n}', stockCount(v, lang));
    return (v: number) => t('rep_smv_times').replace('{n}', stockCount(v, lang));
}

function RankCard({
    title,
    rows,
    by,
    onSort,
    restKey,
    empty,
}: {
    title: string;
    rows: RankRow[];
    by: SortBy;
    onSort: (next: SortBy) => void;
    restKey: string;
    empty: { title: string; hint: string };
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const figure = useFigure(by);
    const sorted = [...rows].sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name, lang));
    const top = sorted.slice(0, RANKS_SHOWN);
    const rest = sorted.slice(RANKS_SHOWN);
    const restSum = rest.reduce((s, r) => s + r[by], 0);
    const scale = top[0]?.[by] || 1;
    const width = (v: number) => `${Math.min(100, Math.max(2, (v / scale) * 100))}%`;
    const line = (key: string, name: string, sub: string, v: number, apart: boolean) => (
        <li
            key={key}
            className={cn(
                'grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_6.5rem]',
                apart && 'border-border border-t-2 border-dashed pt-2.5',
            )}
        >
            <span className="min-w-0">
                <span className={cn('block truncate', apart && 'text-muted-foreground')} title={name}>
                    {name}
                </span>
                <small className="text-muted-foreground block truncate text-xs" title={sub}>
                    {sub}
                </small>
            </span>
            {/* The "others" row sums many people, so it carries no bar on the leader's scale. */}
            {apart ? (
                <span aria-hidden />
            ) : (
                <span aria-hidden className={TRACK}>
                    <span className={cn('block h-full rounded-full', FILL[MV_TONE.issue])} style={{ width: width(v) }} />
                </span>
            )}
            <b className="text-right text-[13px] font-semibold whitespace-nowrap tabular-nums">{figure(v)}</b>
        </li>
    );

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={title}
                sub={
                    <span className="inline-flex items-center gap-2">
                        <span aria-hidden>{t('rep_smv_sort_by')}</span>
                        <Segments
                            label={t('rep_smv_sort_by')}
                            options={SORTS.map((s) => ({ value: s, label: t(`rep_smv_sort_${s}`), count: null }))}
                            value={by}
                            onChange={(next) => next !== by && onSort(next)}
                        />
                    </span>
                }
            />
            {rows.length === 0 ? (
                <CardEmpty kind="empty" title={empty.title} hint={empty.hint} />
            ) : (
                <ul className="space-y-2.5 px-5 py-4">
                    {top.map((r) => line(r.key, r.name, r.sub, r[by], false))}
                    {rest.length > 0 && line('rest', t(restKey).replace('{n}', stockCount(rest.length, lang)), t('rep_smv_rest_sub'), restSum, true)}
                </ul>
            )}
        </Card>
    );
}

function RankCards({ people, departments, filters, patch }: { people: People; departments: Departments; filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    // Each card sorts on its own; both choices live in the URL (people_by / dept_by view filters).
    const peopleBy = sortBy(filters.people_by);
    const deptBy = sortBy(filters.dept_by);
    const noDept = t('rep_smv_no_dept');
    const peopleRows: RankRow[] = people.map((p, i) => ({
        key: `${p.user_id ?? 'name'}-${p.name}-${i}`,
        name: localName({ name: p.name, name_th: p.name_th }, lang) || '—',
        sub: p.department_id === null ? noDept : localName({ name: p.department ?? '', name_th: p.department_th }, lang) || noDept,
        value: p.value,
        qty: p.qty,
        times: p.times,
    }));
    const deptRows: RankRow[] = departments.map((d) => ({
        key: String(d.department_id ?? 'none'),
        name: d.department_id === null ? noDept : localName({ name: d.name ?? '', name_th: d.name_th }, lang) || '—',
        sub: t('rep_smv_dept_sub').replace('{people}', stockCount(d.people, lang)).replace('{n}', stockCount(d.times, lang)),
        value: d.value,
        qty: d.qty,
        times: d.times,
    }));

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <RankCard
                title={t('rep_smv_people_title')}
                rows={peopleRows}
                by={peopleBy}
                onSort={(next) => patch({ people_by: next })}
                restKey="rep_smv_rest_people"
                empty={{ title: t('rep_empty_stock_movements_people'), hint: t('rep_empty_stock_movements_people_hint') }}
            />
            <RankCard
                title={t('rep_smv_dept_title')}
                rows={deptRows}
                by={deptBy}
                onSort={(next) => patch({ dept_by: next })}
                restKey="rep_smv_rest_depts"
                empty={{ title: t('rep_empty_stock_movements_departments'), hint: t('rep_empty_stock_movements_departments_hint') }}
            />
        </div>
    );
}

/* ─────────────────────────── count variance ─────────────────────────── */

function UpDown({ value, dir }: { value: number; dir: 'up' | 'down' }) {
    const lang = useUiStore((s) => s.lang);
    if (value === 0) return <span className={SIGN_INK.none}>0</span>;
    return (
        <span className={cn('font-semibold', dir === 'up' ? SIGN_INK.in : SIGN_INK.out)}>
            {dir === 'up' ? '+' : '−'}
            {stockCount(value, lang)}
        </span>
    );
}

function CountsCard({ counts }: { counts: Counts }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [open, setOpen] = useState(false);
    const { folds, shown } = fold(counts, COUNTS_SHOWN, open);
    const sum = (pick: (c: Counts[number]) => number) => counts.reduce((s, c) => s + pick(c), 0);
    const headings: { key: string; right?: boolean }[] = [
        { key: 'rep_smv_cnt_col_ref' },
        { key: 'rep_smv_cnt_col_wh' },
        { key: 'rep_smv_cnt_col_at' },
        { key: 'rep_smv_cnt_col_lines', right: true },
        { key: 'rep_smv_cnt_col_up', right: true },
        { key: 'rep_smv_cnt_col_down', right: true },
        { key: 'rep_smv_cnt_col_net', right: true },
    ];

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_smv_cnt_title')} info={[t('rep_smv_cnt_info_scope'), t('rep_smv_cnt_info_value')]} />
            {counts.length === 0 ? (
                <CardEmpty kind="empty" title={t('rep_empty_stock_movements_counts')} hint={t('rep_empty_stock_movements_counts_hint')} />
            ) : (
                <>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_smv_cnt_caption')}</caption>
                            <thead>
                                <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                    {headings.map((h) => (
                                        <th key={h.key} scope="col" className={cn(TH, h.right ? 'text-right' : 'text-left')}>
                                            {t(h.key)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((c, i) => (
                                    <tr key={`${c.reference}-${i}`} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'text-left text-xs font-semibold')}>
                                            {c.reference}
                                        </th>
                                        <td className={TD}>{c.warehouse ?? <span className="text-muted-foreground">—</span>}</td>
                                        <td className={cn(TD, 'text-xs')}>{fmt.date(c.committed_at)}</td>
                                        <td className={cn(TD, NUM)}>{stockCount(c.lines, lang)}</td>
                                        <td className={cn(TD, NUM)}>
                                            <UpDown value={c.up} dir="up" />
                                        </td>
                                        <td className={cn(TD, NUM)}>
                                            <UpDown value={c.down} dir="down" />
                                        </td>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{signedMoney(c.net_value, lang)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {counts.length > 1 && (
                                <tfoot>
                                    <tr className="bg-muted/40 border-border border-t font-semibold">
                                        <th scope="row" colSpan={3} className={cn(TD, 'text-left')}>
                                            {t('rep_smv_cnt_total').replace('{n}', stockCount(counts.length, lang))}
                                        </th>
                                        <td className={cn(TD, NUM)}>
                                            {stockCount(
                                                sum((c) => c.lines),
                                                lang,
                                            )}
                                        </td>
                                        <td className={cn(TD, NUM)}>
                                            <UpDown value={sum((c) => c.up)} dir="up" />
                                        </td>
                                        <td className={cn(TD, NUM)}>
                                            <UpDown value={sum((c) => c.down)} dir="down" />
                                        </td>
                                        <td className={cn(TD, NUM)}>
                                            {signedMoney(
                                                sum((c) => c.net_value),
                                                lang,
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={counts.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <KpiRowSkeleton count={5} className={summaryColumns(5)} />
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="overflow-hidden lg:col-span-2 xl:col-span-3">
                    <CardHeadingSkeleton />
                    {/* Heights follow the loaded cards (flow chart + axis, 11 two-line ranks, 10 count rounds). */}
                    <ChartSkeleton className="h-[25rem]" />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={12} />
                </Card>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={16} />
                </Card>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={16} />
                </Card>
            </div>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={11} />
            </Card>
        </div>
    );
}

export function StockMovementsCards({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data, isLoading, isFetching, isError, error } = useStockMovementsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <CardsUpdating updating={isFetching && !isLoading} className="space-y-4">
            <MovementTiles tiles={data.tiles} months={data.months} />
            {/* Side by side from lg; stacked on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <StockFlowCard months={data.months} to={typeof filters.to === 'string' ? filters.to : null} className="lg:col-span-2 xl:col-span-3" />
                <WaitingCard requests={data.requests} className="xl:col-span-2" />
            </div>
            <RankCards people={data.people} departments={data.departments} filters={filters} patch={patch} />
            <CountsCard counts={data.counts} />
        </CardsUpdating>
    );
}
