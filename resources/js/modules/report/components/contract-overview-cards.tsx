// Contract overview report cards: tiles, bills by month, yearly cost by type and cycle, cost by vendor (data: useContractOverviewBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair, otherName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useContractOverviewBreakdown } from '../hooks/use-reports';
import type { ContractOverviewBreakdown, TabularFilters } from '../types';
import { CardsUpdating } from './cards-updating';
import { CardTitle, CardEmpty as Empty, InfoMark, monthLabel, rich } from './chart-parts';
import { FILL } from './chart-tones';
import { ContractMonthCard, compactMoney, contractMoney, type ContractMonth } from './contract-month-card';
import { CONTRACT_TYPE_TONE } from './contract-tones';
import { KpiTile } from './kpi-tile';
import { BarRowsSkeleton, CardHeadingSkeleton, ChartSkeleton, KpiRowSkeleton, TableRowsSkeleton } from './report-skeletons';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Lang = 'th' | 'en';
type Vendor = ContractOverviewBreakdown['vendors'][number];

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle whitespace-nowrap';
const NUM = 'text-right tabular-nums';
const TRACK = 'dark:bg-muted block overflow-hidden rounded-full bg-slate-200';

const count = (n: number, lang: Lang) => formatNumber(n, lang);

/** A vendor's name in the reader's language first, the other one under it. */
function vendorNames(t: (key: string) => string, lang: Lang, v: Pick<Vendor, 'vendor_id' | 'name' | 'name_th'>) {
    if (v.vendor_id === null) return { main: t('rep_cov_no_vendor'), sub: null };
    const main = localPair(v.name, v.name_th, lang) || '';
    const other = otherName({ name: v.name ?? '', name_th: v.name_th }, lang);
    return { main, sub: other };
}

/* ─────────────────────────── tiles ─────────────────────────── */

function OverviewTiles({ tiles }: { tiles: ContractOverviewBreakdown['tiles'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const top = tiles.top_vendor;
    const topName = top ? vendorNames(t, lang, top).main : '';
    const share = top ? Math.round(top.share) : 0;

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t('rep_cov_k_active')}
                badge={<InfoMark info={[t('rep_cov_k_active_hint'), t('rep_cov_k_active_note')]} />}
                value={count(tiles.active, lang)}
                unit={t('rep_cov_unit_contracts')}
                footer={
                    <span className="block truncate">
                        {tiles.in_reminder > 0 ? rich(t('rep_cov_k_active_foot'), { n: count(tiles.in_reminder, lang) }) : t('rep_cov_k_active_none')}
                    </span>
                }
            />
            <KpiTile
                label={t('rep_cov_k_monthly')}
                value={contractMoney(tiles.monthly, lang)}
                footer={<span className="block truncate">{rich(t('rep_cov_k_monthly_foot'), { amount: contractMoney(tiles.yearly, lang) })}</span>}
            />
            <KpiTile
                label={t('rep_cov_k_next12')}
                hint={t('rep_cov_k_next12_hint')}
                value={contractMoney(tiles.next_12, lang)}
                footer={<span className="block truncate">{rich(t('rep_cov_k_next12_foot'), { n: count(tiles.next_12_bills, lang) })}</span>}
            />
            <KpiTile
                label={t('rep_cov_k_remaining')}
                hint={t('rep_cov_k_remaining_hint')}
                value={contractMoney(tiles.remaining, lang)}
                footer={
                    <span className="block truncate">
                        {tiles.longest_end
                            ? rich(t('rep_cov_k_remaining_foot'), { month: monthLabel(tiles.longest_end.slice(0, 7), lang, true) })
                            : t('rep_cov_k_remaining_none')}
                    </span>
                }
            />
            <KpiTile
                label={t('rep_cov_k_top_vendor')}
                value={top ? `${share}%` : '—'}
                unit={top ? t('rep_cov_k_top_vendor_unit') : undefined}
                bar={
                    top
                        ? [
                              { key: 'this', percent: top.share, className: 'bg-brand', title: `${t('rep_cov_k_top_vendor_this')}: ${share}%` },
                              {
                                  key: 'rest',
                                  percent: 100 - top.share,
                                  className: 'bg-transparent',
                                  title: `${t('rep_cov_k_top_vendor_rest')}: ${100 - share}%`,
                              },
                          ]
                        : undefined
                }
                footer={
                    top ? (
                        <span className="flex min-w-0 items-baseline gap-1.5" title={`${topName} ${contractMoney(top.yearly, lang)}`}>
                            <span className="truncate">{topName}</span>
                            <b className="text-foreground shrink-0 font-semibold tabular-nums">{compactMoney(top.yearly)}</b>
                        </span>
                    ) : (
                        t('rep_cov_k_top_vendor_none')
                    )
                }
            />
        </div>
    );
}

/* ─────────────────────────── bills by month ─────────────────────────── */

function BillsCard({ data }: { data: ContractOverviewBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const big = data.biggest_bill;
    const monthFoot = (m: ContractMonth) =>
        rich(t('rep_cov_month_foot'), {
            amount: contractMoney(
                m.items.reduce((sum, item) => sum + item.amount, 0),
                lang,
            ),
            n: count(m.items.length, lang),
        });

    return (
        <ContractMonthCard
            className="xl:col-span-3"
            title={t('rep_cov_month_title')}
            info={[t('rep_cov_month_info_rule'), t('rep_cov_month_info_scope')]}
            months={data.months}
            mode="money"
            rowValue={(item) => contractMoney(item.amount, lang)}
            monthFoot={monthFoot}
            empty={{ title: t('rep_empty_contracts_overview_month'), hint: t('rep_empty_contracts_overview_month_hint') }}
            footer={
                big &&
                rich(
                    t('rep_cov_month_biggest'),
                    { amount: contractMoney(big.amount, lang), code: big.code },
                    { month: monthLabel(big.date.slice(0, 7), lang, false, true), name: big.name },
                )
            }
        />
    );
}

/* ─────────────────────────── yearly cost by type and cycle ─────────────────────────── */

function TypeCard({ data }: { data: ContractOverviewBreakdown }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const total = data.yearly_total;
    const max = Math.max(1, ...data.types.map((x) => x.yearly));
    const lead = data.types[0];
    const percent = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

    return (
        <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <CardTitle
                title={t('rep_cov_type_title')}
                note={total > 0 ? t('rep_cov_type_total').replace('{amount}', contractMoney(total, lang)) : undefined}
            />
            <ul className="space-y-3 px-5 py-4">
                {data.types.map((row) => (
                    <li key={row.type} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
                        <span className="min-w-0">
                            <span className="block truncate">{t(`contract_type_${row.type}`)}</span>
                            <small className="text-muted-foreground block text-xs">
                                {t('rep_cmc_contracts').replace('{n}', count(row.contracts, lang))}
                            </small>
                        </span>
                        {row.yearly > 0 ? (
                            <span
                                role="img"
                                aria-label={`${t(`contract_type_${row.type}`)} ${contractMoney(row.yearly, lang)}`}
                                className={cn(TRACK, 'h-3')}
                            >
                                <span
                                    className={cn('block h-full rounded-full', FILL[CONTRACT_TYPE_TONE[row.type]])}
                                    style={{ width: `${Math.max(2, (row.yearly / max) * 100)}%` }}
                                />
                            </span>
                        ) : (
                            <span className="text-muted-foreground">—</span>
                        )}
                        <b className="text-right text-[13px] font-semibold tabular-nums" title={contractMoney(row.yearly, lang)}>
                            {compactMoney(row.yearly)}
                        </b>
                    </li>
                ))}
            </ul>
            <h3 className="border-border/60 text-muted-foreground border-t px-5 pt-2.5 text-xs font-semibold">{t('rep_cov_cycle_title')}</h3>
            <ul className="grid grid-cols-3 px-5 pt-3 pb-4">
                {data.cycles.map((row, i) => (
                    <li key={row.cycle} className={cn('flex min-w-0 flex-col gap-1', i > 0 && 'border-border/70 border-l pl-3.5', i < 2 && 'pr-3.5')}>
                        <span className="text-muted-foreground text-xs">{t(`contract_billing_${row.cycle}`)}</span>
                        <b aria-hidden className="text-lg leading-tight font-semibold tabular-nums" title={contractMoney(row.yearly, lang)}>
                            {row.yearly > 0 ? compactMoney(row.yearly) : '—'}
                        </b>
                        <span aria-hidden className={cn(TRACK, 'h-1')}>
                            <span className="block h-full rounded-full bg-blue-500" style={{ width: `${percent(row.yearly)}%` }} />
                        </span>
                        <small aria-hidden className="text-muted-foreground flex justify-between gap-1.5 text-xs">
                            <span className="truncate">{t('rep_cmc_contracts').replace('{n}', count(row.contracts, lang))}</span>
                            {row.yearly > 0 && <span className="tabular-nums">{percent(row.yearly)}%</span>}
                        </small>
                        <span className="sr-only">
                            {t('rep_cov_cycle_sr')
                                .replace('{cycle}', t(`contract_billing_${row.cycle}`))
                                .replace('{amount}', contractMoney(row.yearly, lang))
                                .replace('{p}', fmtN(percent(row.yearly)))}
                        </span>
                    </li>
                ))}
            </ul>
            {total > 0 && lead && lead.yearly > 0 && (
                <p className="border-border/60 text-muted-foreground mt-auto line-clamp-2 border-t px-5 py-3 text-xs">
                    {rich(t('rep_cov_type_foot'), { p: `${percent(lead.yearly)}%` }, { type: t(`contract_type_${lead.type}`) })}
                </p>
            )}
        </Card>
    );
}

/* ─────────────────────────── by vendor ─────────────────────────── */

function VendorCard({ vendors, total, monthly, narrowed }: { vendors: Vendor[]; total: number; monthly: number; narrowed: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const sum = (pick: (v: Vendor) => number) => vendors.reduce((s, v) => s + pick(v), 0);
    const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
    const shareText = (v: number) => `${formatNumber(share(v), lang, { decimals: 1 })}%`;
    const ending = (n: number) =>
        n > 0 ? (
            <StatusBadge tone="amber">{t('rep_cmc_contracts').replace('{n}', count(n, lang))}</StatusBadge>
        ) : (
            <span className="text-muted-foreground">—</span>
        );
    const endingTotal = sum((v) => v.ending_soon);

    return (
        <Card className="overflow-hidden">
            <CardTitle title={t('rep_cov_vendor_title')} />
            {vendors.length === 0 ? (
                narrowed ? (
                    <Empty kind="search" title={t('rep_empty_contracts_overview_vendors')} hint={t('rep_empty_contracts_overview_vendors_hint')} />
                ) : (
                    <Empty
                        kind="empty"
                        title={t('rep_empty_contracts_overview_vendors_top')}
                        hint={t('rep_empty_contracts_overview_vendors_top_hint')}
                    />
                )
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('rep_cov_vendor_caption')}</caption>
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_cov_col_vendor')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_cov_col_contracts')}
                                </th>
                                {/* Per month is the yearly figure over 12: tablets keep the yearly one */}
                                <th scope="col" className={cn(TH, 'hidden text-right lg:table-cell')}>
                                    {t('rep_cov_col_monthly')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_cov_col_yearly')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_cov_col_share')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('rep_cov_col_remaining')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-left')}>
                                    {t('rep_cov_col_ending')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((v) => {
                                const names = vendorNames(t, lang, v);
                                return (
                                    <tr key={v.vendor_id ?? 'none'} className="border-border/60 border-b">
                                        <th scope="row" className={cn(TD, 'text-left font-normal', v.vendor_id === null && 'text-muted-foreground')}>
                                            <span className="block max-w-[16rem] truncate font-medium" title={names.main}>
                                                {names.main}
                                            </span>
                                            {names.sub && (
                                                <span className="text-muted-foreground block max-w-[16rem] truncate text-xs" title={names.sub}>
                                                    {names.sub}
                                                </span>
                                            )}
                                        </th>
                                        <td className={cn(TD, NUM)}>{count(v.contracts, lang)}</td>
                                        <td className={cn(TD, NUM, 'hidden lg:table-cell')}>{contractMoney(v.monthly, lang)}</td>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{contractMoney(v.yearly, lang)}</td>
                                        <td className={TD}>
                                            <div className="flex min-w-[7rem] items-center gap-2 lg:min-w-[10rem]">
                                                <span aria-hidden className={cn(TRACK, 'h-2 flex-1')}>
                                                    <span className="bg-brand block h-full rounded-full" style={{ width: `${share(v.yearly)}%` }} />
                                                </span>
                                                <small className="text-muted-foreground w-14 text-right text-xs tabular-nums">
                                                    {shareText(v.yearly)}
                                                </small>
                                            </div>
                                        </td>
                                        <td className={cn(TD, NUM)}>{contractMoney(v.remaining, lang)}</td>
                                        <td className={TD}>{ending(v.ending_soon)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-muted/40 font-semibold">
                                <th scope="row" className={cn(TD, 'text-left')}>
                                    {t('rep_cov_vendor_total').replace('{n}', count(vendors.length, lang))}
                                </th>
                                <td className={cn(TD, NUM)}>
                                    {count(
                                        sum((v) => v.contracts),
                                        lang,
                                    )}
                                </td>
                                <td className={cn(TD, NUM, 'hidden lg:table-cell')}>{contractMoney(monthly, lang)}</td>
                                <td className={cn(TD, NUM)}>{contractMoney(total, lang)}</td>
                                <td className={TD} />
                                <td className={cn(TD, NUM)}>
                                    {contractMoney(
                                        sum((v) => v.remaining),
                                        lang,
                                    )}
                                </td>
                                <td className={TD}>
                                    {endingTotal > 0 ? (
                                        t('rep_cmc_contracts').replace('{n}', count(endingTotal, lang))
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                            </tr>
                        </tfoot>
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
            <div className="grid gap-3 xl:grid-cols-5">
                <Card className="overflow-hidden xl:col-span-3">
                    <CardHeadingSkeleton />
                    <ChartSkeleton />
                </Card>
                <Card className="overflow-hidden xl:col-span-2">
                    <CardHeadingSkeleton />
                    <BarRowsSkeleton rows={5} />
                </Card>
            </div>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={4} />
            </Card>
        </div>
    );
}

export function ContractOverviewCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isFetching, isError, error } = useContractOverviewBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <CardsUpdating updating={isFetching && !isLoading} className="space-y-4">
            <OverviewTiles tiles={data.tiles} />
            {/* Side by side from xl; stacked on a tablet (iPad mini 768px). */}
            <div className="grid gap-3 xl:grid-cols-5">
                <BillsCard data={data} />
                <TypeCard data={data} />
            </div>
            <VendorCard
                vendors={data.vendors}
                total={data.yearly_total}
                monthly={data.tiles.monthly}
                narrowed={Boolean(filters.type || filters.vendor_id || filters.billing_cycle)}
            />
        </CardsUpdating>
    );
}
