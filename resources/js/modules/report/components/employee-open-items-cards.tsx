// "สรุปเรื่องค้างของพนักงาน" report: topic segments, the headline tiles and the four topic cards (data: useEmployeeOpenItemsBreakdown).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Fragment } from 'react';
import { useEmployeeOpenItemsBreakdown } from '../hooks/use-reports';
import type { DataIssueKey, EmployeeOpenItemsBreakdown, OpenItemsAccountKind, OpenItemsGroup, TabularFilters } from '../types';
import { Segments } from './access-overview-cards';
import { count } from './access-parts';
import { InfoPopover } from './info-popover';
import { KpiTile } from './kpi-tile';
import { AccessCard, AccountCard, AssetCard, DataCard } from './open-items-tables';
import { CardHeadingSkeleton, DataTableSkeleton, KpiRowSkeleton } from './report-skeletons';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Patch = (next: TabularFilters) => void;

const DATA_ISSUES: DataIssueKey[] = ['mgr_left', 'no_mgr', 'no_email', 'no_dept', 'no_sec', 'no_pos', 'bad_dates'];
const ACCOUNT_KINDS: OpenItemsAccountKind[] = ['left', 'must_change', 'expired'];

/** Each topic's colour in the tiles' bars and keys. */
const GROUP_FILL: Record<OpenItemsGroup, string> = {
    asset: 'bg-red-600 dark:bg-red-400',
    access: 'bg-cyan-600 dark:bg-cyan-400',
    acct: 'bg-orange-500 dark:bg-orange-400',
    data: 'bg-fuchsia-600 dark:bg-fuchsia-400',
};
const ACCOUNT_FILL: Record<OpenItemsAccountKind, string> = {
    left: 'bg-red-600 dark:bg-red-400',
    must_change: 'bg-amber-400 dark:bg-amber-300',
    expired: 'bg-orange-500 dark:bg-orange-400',
};
const ISSUE_FILL = 'bg-fuchsia-600 dark:bg-fuchsia-400';
const OTHER_FILL = 'bg-slate-500 dark:bg-slate-400';

/** Fills {name} slots of a sentence with bold values. */
function rich(template: string, values: Record<string, React.ReactNode>) {
    return template.split(/(\{\w+\})/).map((part, i) => {
        const slot = /^\{(\w+)\}$/.exec(part);
        return slot ? (
            <b key={i} className="text-foreground font-mono tabular-nums">
                {values[slot[1]]}
            </b>
        ) : (
            <Fragment key={i}>{part}</Fragment>
        );
    });
}

/** One piece of a tile's bar, with the word its key and tooltip use. */
interface Piece {
    key: string;
    n: number;
    fill: string;
    label: string;
    short: string;
    /** The piece's own unit when it differs from the bar's (accounts on the people bar). */
    unit?: string;
}

function KeyDot({ fill }: { fill: string }) {
    return <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', fill)} />;
}

/** A tile's key on one line (names cut with "…"); the full split opens in a note on hover or tap. */
function Key({ title, label, line, split = line }: { title: string; label: string; line: Piece[]; split?: Piece[] }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <InfoPopover
            label={label}
            className="grid w-full min-w-0 auto-cols-[minmax(0,max-content)] grid-flow-col items-center gap-x-2.5 text-left"
            content={
                <div className="min-w-44 space-y-1">
                    <div className="font-semibold">{title}</div>
                    {split.map((p) => (
                        <div key={p.key} className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5">
                                <KeyDot fill={p.fill} />
                                {p.label}
                            </span>
                            <b className={cn('font-mono tabular-nums', p.n === 0 && 'text-muted-foreground font-normal')}>
                                {count(p.n, lang)}
                                {p.unit && <span className="font-sans font-normal"> {p.unit}</span>}
                            </b>
                        </div>
                    ))}
                </div>
            }
        >
            {line.map((p) => (
                <span key={p.key} className="flex min-w-0 items-center gap-1">
                    <KeyDot fill={p.fill} />
                    <span className="truncate">{p.short}</span>
                    <b className="text-foreground shrink-0 font-mono font-semibold tabular-nums">{count(p.n, lang)}</b>
                </span>
            ))}
        </InfoPopover>
    );
}

/** The bar's pieces as percents of what is shown. */
function barOf(pieces: Piece[], unit: string, lang: 'th' | 'en') {
    const shown = pieces.filter((p) => p.n > 0);
    const total = shown.reduce((s, p) => s + p.n, 0);
    return shown.map((p) => ({
        key: p.key,
        percent: (p.n / total) * 100,
        className: p.fill,
        title: `${p.label}: ${count(p.n, lang)} ${p.unit ?? unit}`,
    }));
}

/* ─────────────────────────── topic segments ─────────────────────────── */

/** The topic segment of the filter bar: which cards show. Tiles ignore it. */
export function OpenItemsTopicSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useEmployeeOpenItemsBreakdown(filters);
    const groups: OpenItemsGroup[] = data?.groups ?? ['asset', 'access', 'data'];
    const counts: Record<OpenItemsGroup, number | null> = {
        asset: data?.asset.people ?? null,
        access: data?.access.people ?? null,
        acct: data?.acct?.accounts ?? null,
        data: data?.data.people ?? null,
    };

    return (
        <Segments<OpenItemsGroup | null>
            size="md"
            label={t('rep_fl_group')}
            options={[
                { value: null, label: t('rep_f_any'), count: data?.people_total ?? null },
                ...groups.map((g) => ({ value: g as OpenItemsGroup | null, label: t(`rep_ef_group_${g}`), count: counts[g] })),
            ]}
            value={(filters.group as OpenItemsGroup | null | undefined) ?? null}
            onChange={(group) => patch({ group })}
        />
    );
}

/* ─────────────────────────── tiles ─────────────────────────── */

export function OpenItemsTiles({ data }: { data: EmployeeOpenItemsBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const n = (v: number) => count(v, lang);
    const people = t('rep_ef_people');
    const accountsUnit = t('rep_ef_accounts');
    const groupPieces: Piece[] = [
        { key: 'asset', n: data.asset.people, fill: GROUP_FILL.asset, label: t('rep_ef_group_asset'), short: t('rep_ef_short_asset') },
        { key: 'access', n: data.access.people, fill: GROUP_FILL.access, label: t('rep_ef_group_access'), short: t('rep_ef_short_access') },
        ...(data.acct
            ? [
                  {
                      key: 'acct',
                      n: data.acct.accounts,
                      fill: GROUP_FILL.acct,
                      label: t('rep_ef_group_acct'),
                      short: t('rep_ef_short_acct'),
                      unit: accountsUnit,
                  },
              ]
            : []),
        { key: 'data', n: data.data.people, fill: GROUP_FILL.data, label: t('rep_ef_group_data'), short: t('rep_ef_short_data') },
    ];
    const said = (pieces: Piece[], unit = people) =>
        pieces
            .filter((p) => p.n > 0)
            .map((p) => `${p.label} ${n(p.n)} ${p.unit ?? unit}`)
            .join(', ');

    // ข้อมูลไม่ครบ: the commonest issue, the rest folded
    const issuePieces: Piece[] = DATA_ISSUES.map((k) => ({
        key: k,
        n: data.data.by_issue[k],
        fill: ISSUE_FILL,
        label: t(`rep_ef_issue_${k}`),
        short: t(`rep_ef_short_${k}`),
    }))
        .filter((p) => p.n > 0)
        .sort((a, b) => b.n - a.n);
    const [topIssue, ...otherIssues] = issuePieces;
    const dataBar: Piece[] = topIssue
        ? [
              topIssue,
              ...(otherIssues.length
                  ? [
                        {
                            key: 'other',
                            n: otherIssues.reduce((s, p) => s + p.n, 0),
                            fill: OTHER_FILL,
                            label: t('rep_ef_other'),
                            short: t('rep_ef_other'),
                        },
                    ]
                  : []),
          ]
        : [];

    const acct = data.acct;
    const accountPieces: Piece[] = ACCOUNT_KINDS.map((k) => ({
        key: k,
        n: acct?.by_kind[k] ?? 0,
        fill: ACCOUNT_FILL[k],
        label: t(`rep_ef_acct_kind_${k}`),
        short: t(`rep_ef_acct_short_${k}`),
    }));

    const tiles = 4 + (acct ? 1 : 0);
    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(tiles))}>
            <KpiTile
                label={t('rep_ef_k_total')}
                value={n(data.people_total)}
                unit={people}
                footer={
                    data.people_total > 0 ? (
                        <Key title={t('rep_ef_by_topic')} label={t('rep_ef_total_said').replace('{parts}', said(groupPieces))} line={groupPieces} />
                    ) : (
                        t('rep_ef_total_none')
                    )
                }
            />
            <KpiTile
                label={t('rep_ef_group_asset')}
                value={n(data.asset.people)}
                unit={people}
                alert={data.asset.people > 0 ? 'red' : undefined}
                footer={
                    data.asset.people > 0
                        ? rich(t('rep_ef_asset_foot'), { pieces: n(data.asset.pieces), days: n(data.asset.oldest_days ?? 0) })
                        : t('rep_ef_asset_clear')
                }
            />
            <KpiTile
                label={t('rep_ef_group_access')}
                value={n(data.access.people)}
                unit={people}
                alert={data.access.people > 0 ? 'red' : undefined}
                footer={
                    data.access.people > 0
                        ? rich(t('rep_ef_access_foot'), { n: n(data.access.grants), days: n(data.access.oldest_days ?? 0) })
                        : t('rep_ef_access_clear')
                }
            />
            {acct && (
                <KpiTile
                    label={t('rep_ef_group_acct')}
                    value={n(acct.accounts)}
                    unit={accountsUnit}
                    bar={acct.accounts > 0 ? barOf(accountPieces, accountsUnit, lang) : undefined}
                    footer={
                        acct.accounts > 0 ? (
                            <Key title={t('rep_ef_group_acct')} label={said(accountPieces, accountsUnit)} line={accountPieces} />
                        ) : (
                            t('rep_ef_acct_none')
                        )
                    }
                />
            )}
            <KpiTile
                label={t('rep_ef_group_data')}
                value={n(data.data.people)}
                unit={people}
                alert={data.data.people > 0 ? 'amber' : undefined}
                bar={data.data.people > 0 ? barOf(dataBar, people, lang) : undefined}
                footer={
                    topIssue ? (
                        <Key title={t('rep_ef_group_data')} label={said(issuePieces)} line={dataBar} split={issuePieces} />
                    ) : (
                        t('rep_ef_data_none')
                    )
                }
            />
        </div>
    );
}

/* ─────────────────────────── page body ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <KpiRowSkeleton count={5} className={summaryColumns(5)} />
            {[0, 1].map((i) => (
                <Card key={i} className="overflow-hidden">
                    <CardHeadingSkeleton />
                    <div className="p-5">
                        <DataTableSkeleton rows={4} cols={5} />
                    </div>
                </Card>
            ))}
        </div>
    );
}

/** The tiles, then the topic cards the topic segment picks. */
export function EmployeeOpenItemsCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useEmployeeOpenItemsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    const topic = (filters.group as OpenItemsGroup | null | undefined) ?? null;
    const shows = (group: OpenItemsGroup) => data.groups.includes(group) && (topic === null || topic === group);
    // A department or a search narrowed the cards, so an empty one says so instead of "all clear".
    const narrowed = Boolean(filters.department_id || filters.search);

    return (
        <div className="space-y-4">
            <OpenItemsTiles data={data} />
            {shows('asset') && <AssetCard group={data.asset} narrowed={narrowed} />}
            {shows('access') && <AccessCard group={data.access} narrowed={narrowed} />}
            {shows('acct') && data.acct && <AccountCard group={data.acct} narrowed={narrowed} />}
            {shows('data') && <DataCard group={data.data} narrowed={narrowed} />}
        </div>
    );
}
