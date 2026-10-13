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
const GROUP_FILL: Record<OpenItemsGroup, string> = { asset: 'bg-red-500', access: 'bg-cyan-600', acct: 'bg-violet-500', data: 'bg-amber-600' };
const ACCOUNT_FILL: Record<OpenItemsAccountKind, string> = { left: 'bg-violet-700', must_change: 'bg-violet-400', expired: 'bg-violet-300' };

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
}

const KEY_CLASS = 'inline-flex items-center gap-1 whitespace-nowrap';

function KeyDot({ fill }: { fill: string }) {
    return <i aria-hidden className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', fill)} />;
}

/** A tile's key under its bar: a dot, the short name and the number. */
function Key({ pieces }: { pieces: Piece[] }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
            {pieces.map((p) => (
                <span key={p.key} className={KEY_CLASS}>
                    <KeyDot fill={p.fill} />
                    {p.short} <b className="text-foreground font-mono tabular-nums">{count(p.n, lang)}</b>
                </span>
            ))}
        </span>
    );
}

/** The bar's pieces as percents of what is shown. */
function barOf(pieces: Piece[], unit: string, lang: 'th' | 'en') {
    const shown = pieces.filter((p) => p.n > 0);
    const total = shown.reduce((s, p) => s + p.n, 0);
    return shown.map((p) => ({ key: p.key, percent: (p.n / total) * 100, className: p.fill, title: `${p.label}: ${count(p.n, lang)} ${unit}` }));
}

/** Read aloud: what the bar says. */
function Said({ text }: { text: string }) {
    return <span className="sr-only">{text}</span>;
}

/** The data tile's key: the commonest issue, the rest folded under "อื่น ๆ" with a note that lists them. */
function DataKey({ top, rest }: { top: Piece; rest: Piece[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const folded = rest.reduce((s, p) => s + p.n, 0);
    return (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
            <span className={KEY_CLASS}>
                <KeyDot fill={top.fill} />
                {top.short} <b className="text-foreground font-mono tabular-nums">{count(top.n, lang)}</b>
            </span>
            {rest.length > 0 && (
                <InfoPopover
                    label={t('rep_ef_other')}
                    className={cn(KEY_CLASS, 'cursor-help underline decoration-dotted underline-offset-2')}
                    content={
                        <div className="space-y-1">
                            {rest.map((p) => (
                                <p key={p.key}>{rich(t('rep_ef_other_line').replace('{label}', p.label), { n: count(p.n, lang) })}</p>
                            ))}
                        </div>
                    }
                >
                    <KeyDot fill="bg-amber-300" />
                    {t('rep_ef_other')} <b className="text-foreground font-mono tabular-nums">{count(folded, lang)}</b>
                </InfoPopover>
            )}
        </span>
    );
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
    const itemsUnit = t('rep_ef_unit_items');

    const dataItems = DATA_ISSUES.reduce((sum, k) => sum + data.data.by_issue[k], 0);
    const groupPieces: Piece[] = [
        { key: 'asset', n: data.asset.people, fill: GROUP_FILL.asset, label: t('rep_ef_group_asset'), short: t('rep_ef_short_asset') },
        { key: 'access', n: data.access.people, fill: GROUP_FILL.access, label: t('rep_ef_group_access'), short: t('rep_ef_short_access') },
        ...(data.acct
            ? [{ key: 'acct', n: data.acct.accounts, fill: GROUP_FILL.acct, label: t('rep_ef_group_acct'), short: t('rep_ef_short_acct') }]
            : []),
        { key: 'data', n: dataItems, fill: GROUP_FILL.data, label: t('rep_ef_group_data'), short: t('rep_ef_short_data') },
    ];
    const itemTotal = groupPieces.reduce((sum, p) => sum + p.n, 0);
    const said = (pieces: Piece[]) =>
        pieces
            .filter((p) => p.n > 0)
            .map((p) => `${p.label} ${n(p.n)}`)
            .join(', ');

    // ข้อมูลไม่ครบ: the commonest issue, the rest folded
    const issuePieces: Piece[] = DATA_ISSUES.map((k) => ({
        key: k,
        n: data.data.by_issue[k],
        fill: 'bg-amber-700',
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
                            fill: 'bg-amber-300',
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
                bar={data.people_total > 0 ? barOf(groupPieces, itemsUnit, lang) : undefined}
                footer={
                    data.people_total > 0 ? (
                        <>
                            <Key pieces={groupPieces} />
                            <Said text={t('rep_ef_total_said').replace('{n}', n(itemTotal)).replace('{parts}', said(groupPieces))} />
                        </>
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
                            <>
                                <Key pieces={accountPieces} />
                                <Said text={said(accountPieces)} />
                            </>
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
                        <>
                            <DataKey top={topIssue} rest={otherIssues} />
                            <Said text={said(issuePieces)} />
                        </>
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
