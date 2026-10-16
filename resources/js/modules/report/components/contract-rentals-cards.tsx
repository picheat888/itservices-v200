// "สัญญาเช่าและทรัพย์สิน" cards: scope and list segments, tiles, assets by status per contract, rent against buying per model.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Fragment, useState } from 'react';
import { useContractRentalsBreakdown } from '../hooks/use-reports';
import type { ChartTone, ContractRentalKind, ContractRentalsBreakdown, ContractRentalState, RentalAssetStatus, TabularFilters } from '../types';
import { Segments } from './access-overview-cards';
import { CardTitle, CountBar, CardEmpty as Empty, FoldToggle, rich, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { ContractCode, ContractNameCell } from './contract-cells';
import { ContractLeftPill } from './contract-left-pill';
import { compactMoney, contractMoney } from './contract-month-card';
import { CONTRACT_SOURCE_TONE } from './contract-tones';
import { KpiTile } from './kpi-tile';
import { CardHeadingSkeleton, KpiRowSkeleton, TableRowsSkeleton } from './report-skeletons';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Lang = 'th' | 'en';
type Patch = (next: TabularFilters) => void;
type ContractRow = ContractRentalsBreakdown['contracts'][number];
type ModelRow = ContractRentalsBreakdown['models'][number];

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle';
const NUM = 'text-right tabular-nums';

/** Asset statuses in the order and colours of Settings → Assets, written off last. */
const STATUSES: { key: RentalAssetStatus; label_key: string; tone: ChartTone }[] = [
    { key: 'ready', label_key: 'asset_ready', tone: 'asset-ready' },
    { key: 'deployed', label_key: 'asset_deployed', tone: 'asset-deployed' },
    { key: 'common', label_key: 'asset_common', tone: 'asset-common' },
    { key: 'pending_acceptance', label_key: 'asset_pending_accept', tone: 'asset-pending-acceptance' },
    { key: 'pending_return', label_key: 'asset_pending_return', tone: 'asset-pending-return' },
    { key: 'writeoff', label_key: 'asset_writeoff', tone: 'asset-writeoff' },
];

const KIND_LABEL: Record<ContractRentalKind, string> = { rent: 'rep_src_rented', buy: 'rep_src_purchased', none: 'rep_crent_src_none' };

/** Linked contracts shown before the list folds, and unlinked ones under their group row. */
const FOLD_LINKED = 10;
const FOLD_UNLINKED = 3;

const count = (n: number, lang: Lang) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');

/** The page's filters without the list segment, which narrows only the rows. */
function cardFilters(filters: TabularFilters): TabularFilters {
    const { list: _list, ...rest } = filters;
    void _list;
    return rest;
}

/* ─────────────────────────── segments ─────────────────────────── */

/** Open / all hardware contracts, in the filter bar. */
export function RentalsScopeSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    return (
        <Segments
            size="md"
            label={t('rep_fl_crent_scope')}
            options={(['open', 'all'] as const).map((s) => ({ value: s as string, label: t(`rep_crent_scope_${s}`), count: null }))}
            value={filters.scope === 'all' ? 'all' : 'open'}
            onChange={(scope) => patch({ scope })}
        />
    );
}

/** Beside the list's heading: every linked asset, or only the rented ones that must go back. */
export function RentalsListSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useContractRentalsBreakdown(cardFilters(filters));
    const counts = data
        ? {
              all: data.contracts.reduce((sum, c) => sum + c.units, 0),
              return: data.contracts.reduce((sum, c) => sum + c.due_soon + c.ended_out, 0),
          }
        : null;

    return (
        <Segments
            label={t('rep_fl_crent_list')}
            options={(['all', 'return'] as const).map((s) => ({
                value: s as string,
                label: t(`rep_crent_list_${s}`),
                count: counts ? counts[s] : null,
            }))}
            value={filters.list === 'return' ? 'return' : 'all'}
            onChange={(list) => patch({ list })}
        />
    );
}

/* ─────────────────────────── shared cells ─────────────────────────── */

/** เช่า / ซื้อ / ไม่ผูกเครื่อง as a pill in the source colours. */
export function SourcePill({ kind }: { kind: ContractRentalKind }) {
    const t = useT();
    return <StatusBadge tone={CONTRACT_SOURCE_TONE[kind] as 'violet' | 'orange' | 'gray'}>{t(KIND_LABEL[kind])}</StatusBadge>;
}

export function LeftPill({ state, days }: { state: ContractRentalState; days: number | null }) {
    const closed = state === 'cancelled' || state === 'expired' ? state : null;
    return <ContractLeftPill days={days} inReminder={state === 'reminder'} closed={closed} />;
}

/** A legend: a dot per status, with its name. */
function StatusLegend({ used }: { used: typeof STATUSES }) {
    const t = useT();
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {used.map((s) => (
                <Swatch key={s.key} fill={FILL[s.tone]}>
                    {t(s.label_key)}
                </Swatch>
            ))}
        </span>
    );
}

/** Assets by status as one stacked bar on the card's shared scale, each count inside its piece. */
function StatusBar({ statuses, scale }: { statuses: Record<RentalAssetStatus, number>; scale: number }) {
    const t = useT();
    return <CountBar pieces={STATUSES.map((s) => ({ key: s.key, label: t(s.label_key), tone: s.tone, value: statuses[s.key] }))} scale={scale} />;
}

/* ─────────────────────────── tiles ─────────────────────────── */

function Tiles({ data }: { data: ContractRentalsBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const tiles = data.tiles;
    const n = (v: number) => count(v, lang);
    const kinds: { key: ContractRentalKind; label: string; short: string; value: number }[] = [
        { key: 'rent', label: t('rep_src_rented'), short: t('rep_src_rented'), value: tiles.contracts.rent },
        { key: 'buy', label: t('rep_src_purchased'), short: t('rep_src_purchased'), value: tiles.contracts.buy },
        { key: 'none', label: t('rep_crent_src_none'), short: t('rep_crent_src_none_short'), value: tiles.contracts.none },
    ];
    const unitContracts = t('rep_crent_u_contracts');
    const unitAssets = t('rep_crent_u_units');
    const dueFoot =
        tiles.due_soon === 0
            ? t('rep_crent_due_none')
            : tiles.due_soon_held > 0
              ? rich(t('rep_crent_due_held'), { n: n(tiles.due_soon_held) })
              : tiles.due_soon_ready === tiles.due_soon
                ? t('rep_crent_due_in_store')
                : t('rep_crent_due_not_held');

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t(data.scope === 'open' ? 'rep_crent_k_open' : 'rep_crent_k_all')}
                value={n(tiles.contracts.total)}
                unit={unitContracts}
                bar={
                    tiles.contracts.total > 0
                        ? kinds
                              .filter((k) => k.value > 0)
                              .map((k) => ({
                                  key: k.key,
                                  percent: (k.value / tiles.contracts.total) * 100,
                                  className: FILL[CONTRACT_SOURCE_TONE[k.key]],
                                  title: `${k.label}: ${n(k.value)} ${unitContracts}`,
                              }))
                        : []
                }
                footer={
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        {kinds.map((k) => (
                            <span key={k.key} className="inline-flex items-center gap-1" title={k.label}>
                                <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', FILL[CONTRACT_SOURCE_TONE[k.key]])} />
                                {k.short}
                                <b className="text-foreground font-semibold tabular-nums">{n(k.value)}</b>
                            </span>
                        ))}
                    </span>
                }
            />
            <KpiTile
                label={t('rep_crent_k_rented')}
                hint={t('rep_crent_k_rented_hint')}
                value={n(tiles.rented_in_use)}
                unit={unitAssets}
                footer={
                    tiles.avg_per_unit === null
                        ? t('rep_crent_rented_none')
                        : rich(t('rep_crent_rented_avg'), { avg: contractMoney(tiles.avg_per_unit, lang) })
                }
            />
            <KpiTile
                label={t('rep_crent_k_due')}
                value={n(tiles.due_soon)}
                unit={unitAssets}
                alert={tiles.due_soon > 0 ? 'amber' : undefined}
                footer={dueFoot}
            />
            <KpiTile
                label={t('rep_crent_k_ended')}
                value={n(tiles.ended_out)}
                unit={unitAssets}
                alert={tiles.ended_out > 0 ? 'red' : undefined}
                footer={tiles.ended_out > 0 ? rich(t('rep_crent_ended_from'), { n: n(tiles.ended_out_contracts) }) : t('rep_crent_ended_none')}
            />
            <KpiTile
                label={t('rep_crent_k_unlinked')}
                hint={t('rep_crent_k_unlinked_hint')}
                value={n(tiles.unlinked)}
                unit={unitContracts}
                footer={
                    tiles.unlinked > 0
                        ? rich(t('rep_crent_unlinked_yearly'), { amount: contractMoney(tiles.unlinked_yearly, lang) })
                        : t('rep_crent_unlinked_none')
                }
            />
        </div>
    );
}

/* ─────────────────────────── assets by status per contract ─────────────────────────── */

function ContractLine({ row, scale }: { row: ContractRow; scale: number }) {
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();

    return (
        <tr className="border-border/60 border-b last:border-b-0">
            <td className={cn(TD, 'whitespace-nowrap')}>
                <ContractCode id={row.id} code={row.code} />
            </td>
            <td className={TD}>
                <ContractNameCell name={row.name} vendor={row.vendor} />
            </td>
            <td className={TD}>
                <SourcePill kind={row.kind} />
            </td>
            <td className={cn(TD, 'w-1/3 min-w-[12rem]')}>
                {row.units === 0 ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <StatusBar statuses={row.statuses} scale={scale} />
                        </div>
                        <b className="min-w-6 text-right font-semibold tabular-nums">{count(row.units, lang)}</b>
                    </div>
                )}
            </td>
            <td className={cn(TD, NUM, 'whitespace-nowrap')}>
                {row.per_unit === null ? <span className="text-muted-foreground">—</span> : contractMoney(row.per_unit, lang)}
            </td>
            <td className={cn(TD, 'whitespace-nowrap')}>
                <div className="text-xs">{fmt.date(row.end_date)}</div>
                <div className="mt-1">
                    <LeftPill state={row.state} days={row.days_left} />
                </div>
            </td>
        </tr>
    );
}

function ContractsCard({ data }: { data: ContractRentalsBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState(false);
    const linked = data.contracts.filter((c) => c.kind !== 'none');
    const unlinked = data.contracts.filter((c) => c.kind === 'none');
    const used = STATUSES.filter((s) => data.contracts.some((c) => c.statuses[s.key] > 0));
    const scale = Math.max(1, ...data.contracts.map((c) => c.units));
    const linkedShown = open ? linked : linked.slice(0, FOLD_LINKED);
    const unlinkedShown = open ? unlinked : unlinked.slice(0, FOLD_UNLINKED);
    const folds = linked.length > FOLD_LINKED || unlinked.length > FOLD_UNLINKED;
    const unlinkedYearly = data.tiles.unlinked_yearly;
    const heads = [
        'rep_crent_col_code',
        'rep_crent_col_name',
        'rep_crent_col_source',
        'rep_crent_col_units',
        'rep_crent_col_per_unit',
        'rep_crent_col_end',
    ];

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_crent_ct_title')}
                info={[t('rep_crent_ct_info1'), t('rep_crent_ct_info2')]}
                sub={used.length > 0 ? <StatusLegend used={used} /> : undefined}
            />
            {data.contracts.length === 0 ? (
                <Empty>{t('rep_crent_ct_empty')}</Empty>
            ) : (
                <>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_crent_ct_caption')}</caption>
                            <thead>
                                <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                    {heads.map((key) => (
                                        <th key={key} scope="col" className={cn(TH, key === 'rep_crent_col_per_unit' ? 'text-right' : 'text-left')}>
                                            {t(key)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {linkedShown.map((row) => (
                                    <ContractLine key={row.id} row={row} scale={scale} />
                                ))}
                            </tbody>
                            {/* Its own row group, so the group header covers the unlinked contracts only */}
                            {unlinked.length > 0 && (
                                <tbody>
                                    <tr
                                        className={cn(
                                            'bg-muted/40 border-border/60 border-b',
                                            linked.length > 0 && 'border-border border-t-2 border-dashed',
                                        )}
                                    >
                                        <th
                                            scope="rowgroup"
                                            colSpan={6}
                                            className={cn(TD, 'text-muted-foreground py-2 text-left text-xs font-semibold')}
                                        >
                                            {rich(t('rep_crent_ct_unlinked'), {
                                                n: count(unlinked.length, lang),
                                                amount: contractMoney(unlinkedYearly, lang),
                                            })}
                                        </th>
                                    </tr>
                                    {unlinkedShown.map((row) => (
                                        <ContractLine key={row.id} row={row} scale={scale} />
                                    ))}
                                </tbody>
                            )}
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={data.contracts.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── rent against buying per model ─────────────────────────── */

/** The whole term's rent against the purchase price, two bars on the row's own scale. */
function VersusBars({ row }: { row: ModelRow }) {
    const t = useT();
    const scale = Math.max(row.rent_total, row.avg_buy ?? 0) || 1;
    const bars = [
        { key: 'rent', label: t('rep_src_rented'), value: row.rent_total, fill: FILL[CONTRACT_SOURCE_TONE.rent] },
        ...(row.avg_buy === null ? [] : [{ key: 'buy', label: t('rep_src_purchased'), value: row.avg_buy, fill: FILL[CONTRACT_SOURCE_TONE.buy] }]),
    ];

    return (
        <div className="grid min-w-[12rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
            <span className="sr-only">
                {t('rep_crent_vs_aria')
                    .replace('{rent}', compactMoney(row.rent_total))
                    .replace('{buy}', row.avg_buy === null ? '—' : compactMoney(row.avg_buy))}
            </span>
            {bars.map((b) => (
                <Fragment key={b.key}>
                    <span aria-hidden className="text-muted-foreground text-xs">
                        {b.label}
                    </span>
                    <span aria-hidden className="dark:bg-muted block h-2 overflow-hidden rounded-full bg-slate-200">
                        <span className={cn('block h-full rounded-full', b.fill)} style={{ width: `${(b.value / scale) * 100}%` }} />
                    </span>
                    <b aria-hidden className="text-right text-xs font-semibold tabular-nums">
                        {compactMoney(b.value)}
                    </b>
                </Fragment>
            ))}
        </div>
    );
}

function ModelsCard({ models }: { models: ModelRow[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const label = (m: ModelRow) => (m.name ? [m.brand, m.name].filter(Boolean).join(' ') : t('rep_crent_vs_no_model'));
    const category = (m: ModelRow) => (lang === 'th' && m.category.name_th) || m.category.name || t('rep_no_data');
    const heads: { key: string; right: boolean }[] = [
        { key: 'rep_crent_col_model', right: false },
        { key: 'rep_crent_col_rented', right: true },
        { key: 'rep_crent_col_rent_unit', right: true },
        { key: 'rep_crent_col_avg_buy', right: true },
        { key: 'rep_crent_col_break_even', right: true },
        { key: 'rep_crent_col_vs', right: false },
    ];
    const dash = <span className="text-muted-foreground">—</span>;

    return (
        <Card className="overflow-hidden">
            <CardTitle title={t('rep_crent_vs_title')} info={[t('rep_crent_vs_info1'), t('rep_crent_vs_info2')]} note={t('rep_crent_vs_note')} />
            {models.length === 0 ? (
                <Empty>{t('rep_crent_vs_empty')}</Empty>
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_crent_vs_caption')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                {heads.map((h) => (
                                    <th key={h.key} scope="col" className={cn(TH, h.right ? 'text-right' : 'text-left')}>
                                        {t(h.key)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {models.map((m) => (
                                <tr key={m.model_id ?? 'none'} className="border-border/60 border-b last:border-b-0">
                                    <th scope="row" className={cn(TD, 'text-left font-normal')}>
                                        <div className="max-w-[16rem] truncate font-medium" title={label(m)} translate="no">
                                            {label(m)}
                                        </div>
                                        <div className="text-muted-foreground text-xs">
                                            {t('rep_crent_vs_where').replace('{cat}', category(m)).replace('{n}', count(m.contracts, lang))}
                                        </div>
                                    </th>
                                    <td className={cn(TD, NUM, 'font-semibold')}>{count(m.units, lang)}</td>
                                    <td className={cn(TD, NUM, 'whitespace-nowrap')}>{contractMoney(m.per_unit, lang)}</td>
                                    <td className={cn(TD, NUM, 'whitespace-nowrap')}>
                                        {m.avg_buy === null ? (
                                            dash
                                        ) : (
                                            <>
                                                <div>{contractMoney(m.avg_buy, lang)}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {t('rep_crent_vs_from').replace('{n}', count(m.bought, lang))}
                                                </div>
                                            </>
                                        )}
                                    </td>
                                    <td className={cn(TD, NUM, 'whitespace-nowrap')}>
                                        {m.break_even_months === null
                                            ? dash
                                            : t('rep_crent_vs_months').replace(
                                                  '{n}',
                                                  m.break_even_months.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                                                      minimumFractionDigits: 1,
                                                      maximumFractionDigits: 1,
                                                  }),
                                              )}
                                    </td>
                                    <td className={cn(TD, 'w-1/4')}>
                                        <VersusBars row={m} />
                                    </td>
                                </tr>
                            ))}
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
            <KpiRowSkeleton count={5} className={summaryColumns(5)} />
            {[6, 4].map((rows) => (
                <Card key={rows} className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <TableRowsSkeleton rows={rows} />
                </Card>
            ))}
        </div>
    );
}

export function ContractRentalsCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useContractRentalsBreakdown(cardFilters(filters));

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <Tiles data={data} />
            <ContractsCard data={data} />
            <ModelsCard models={data.models} />
        </div>
    );
}
