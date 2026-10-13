// The four topic cards of the "สรุปเรื่องค้างของพนักงาน" page: leaver assets, leaver access, accounts and incomplete employee data.
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import type { AccessType, DataIssueKey, EmployeeOpenItemsBreakdown, OpenItemsPerson } from '../types';
import { TYPE_TONE } from './access-overview-cards';
import { count, deptName, type Lang } from './access-parts';
import { CardTitle } from './chart-parts';
import { FILL } from './chart-tones';
import { shortDate } from './transfer-cards';

type AssetRow = EmployeeOpenItemsBreakdown['asset']['rows'][number];
type AccessRowData = EmployeeOpenItemsBreakdown['access']['rows'][number];
type AcctRow = NonNullable<EmployeeOpenItemsBreakdown['acct']>['rows'][number];
type DataRow = EmployeeOpenItemsBreakdown['data']['rows'][number];

const PAGE = 20;
const ACCESS_TYPES: AccessType[] = ['email_group', 'file_share', 'social_platform', 'software'];
const TOP = 'align-top';
const NONE = <span className="text-muted-foreground">—</span>;

/** Asset status as a pill: the pill colour of the Asset module's own statuses. */
const ASSET_STATUS: Record<string, { key: string; tone: 'green' | 'amber' | 'gray' | 'violet' }> = {
    ready: { key: 'asset_ready', tone: 'green' },
    pending_acceptance: { key: 'asset_pending_accept', tone: 'amber' },
    deployed: { key: 'asset_deployed', tone: 'gray' },
    common: { key: 'asset_common', tone: 'gray' },
    pending_return: { key: 'asset_pending_return', tone: 'violet' },
    writeoff: { key: 'asset_writeoff', tone: 'gray' },
};

const personName = (p: { name: string; name_th: string | null }, lang: Lang) => (lang === 'th' && p.name_th) || p.name;

/** Whole days from a "Y-m-d" date to today. */
function daysSince(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    const today = new Date();
    return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
}

/* ─────────────────────────── shared cells ─────────────────────────── */

/** The person's name (opening them on the Employees page) with their code under it. */
function PersonCell({ person, note }: { person: OpenItemsPerson; note?: string }) {
    const canOpen = useCanOpen();
    const lang = useUiStore((s) => s.lang);
    const href = `/employees?view=${person.id}`;
    const name = personName(person, lang);
    return (
        <div className="min-w-0">
            {canOpen(href) ? (
                <Link
                    to={href}
                    translate="no"
                    title={person.name}
                    className="text-brand focus-visible:ring-brand block max-w-[15rem] truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {name}
                </Link>
            ) : (
                <div translate="no" title={person.name} className="max-w-[15rem] truncate font-medium">
                    {name}
                </div>
            )}
            <div translate="no" className="text-muted-foreground font-mono text-xs">
                {person.code}
            </div>
            {note && <div className="text-muted-foreground mt-0.5 text-xs">{note}</div>}
        </div>
    );
}

/** Department with the section under it. */
function DeptCell({ person }: { person: OpenItemsPerson }) {
    const lang = useUiStore((s) => s.lang);
    const dept = deptName(person.department, lang);
    if (!dept) return NONE;
    return (
        <div className="max-w-40 min-w-26">
            <div>{dept}</div>
            {person.section && <div className="text-muted-foreground mt-0.5 text-xs">{deptName(person.section, lang)}</div>}
        </div>
    );
}

/** The last day with how long ago (or how long to go) under it. */
function LastDayCell({ person }: { person: OpenItemsPerson }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (!person.last_day || person.days_out === null) return <span className="text-muted-foreground">{t('rep_ef_last_none')}</span>;
    const days = person.days_out;
    const words =
        days > 0
            ? t('rep_ef_last_ago').replace('{n}', count(days, lang))
            : days === 0
              ? t('rep_ef_last_today')
              : t('rep_ef_last_in').replace('{n}', count(-days, lang));
    return (
        <div className="whitespace-nowrap">
            {shortDate(person.last_day, lang)}
            <div className="text-muted-foreground text-xs">{words}</div>
        </div>
    );
}

/** A card: heading with its ⓘ and count, then the table. */
function TopicCard({
    id,
    title,
    info,
    size,
    children,
}: {
    id: string;
    title: string;
    info: string[];
    size: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Card id={id} className="overflow-clip">
            <CardTitle title={title} info={info} sub={size} />
            <div className="p-5">{children}</div>
        </Card>
    );
}

/** "3 คน" with the number in the mono face. */
function CountLabel({ n, unit }: { n: number; unit: 'people' | 'accounts' }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (n === 0) return null;
    const [before, after] = t(unit === 'people' ? 'rep_ef_count_people' : 'rep_ef_count_accounts').split('{n}');
    return (
        <span>
            {before}
            <b className="text-foreground font-mono tabular-nums">{count(n, lang)}</b>
            {after}
        </span>
    );
}

/** The rows of a card, 20 a page once there are more than that. */
function TopicTable<T>({
    caption,
    columns,
    rows,
    rowKey,
    empty,
}: {
    caption: string;
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    empty: string;
}) {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(PAGE);
    return (
        <DataTable
            caption={caption}
            columns={columns}
            rows={rows}
            rowKey={rowKey}
            emptyState={empty}
            tableClassName="min-w-[44rem]"
            hidePagination={rows.length <= PAGE}
            paging={{
                page,
                pageSize: size,
                onPageChange: setPage,
                onPageSizeChange: (next) => {
                    setSize(next);
                    setPage(1);
                },
            }}
        />
    );
}

/** What an empty card says: that the filters leave nothing, or that the topic is all clear. */
const emptyText = (t: (key: string) => string, narrowed: boolean, clear: string) => (narrowed ? t('rep_ef_empty_filtered') : clear);

/* ─────────────────────────── assets ─────────────────────────── */

export function AssetCard({ group, narrowed }: { group: EmployeeOpenItemsBreakdown['asset']; narrowed: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    // Code, category / model and status line up one asset per line.
    const lines = (row: AssetRow, draw: (asset: AssetRow['assets'][number]) => React.ReactNode) => (
        <div className="flex flex-col gap-2.5 text-[13px]">
            {row.assets.map((a) => (
                <div key={a.id} className="flex min-h-9.5 items-start">
                    {draw(a)}
                </div>
            ))}
        </div>
    );
    const columns: Column<AssetRow>[] = [
        { key: 'who', header: t('rep_ef_col_leaver'), className: TOP, render: (r) => <PersonCell person={r} /> },
        { key: 'dept', header: t('rep_ef_col_dept'), className: TOP, render: (r) => <DeptCell person={r} /> },
        { key: 'last', header: t('rep_ef_col_last_day'), className: TOP, render: (r) => <LastDayCell person={r} /> },
        {
            key: 'code',
            header: t('rep_ef_col_assets'),
            className: TOP,
            render: (r) =>
                lines(r, (a) =>
                    a.code && canOpen(`/assets?view=${a.id}`) ? (
                        <Link
                            to={`/assets?view=${a.id}`}
                            translate="no"
                            className="text-brand focus-visible:ring-brand rounded-sm font-mono text-[12.5px] font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {a.code}
                        </Link>
                    ) : (
                        <span translate="no" className="font-mono text-[12.5px] font-semibold">
                            {a.code}
                        </span>
                    ),
                ),
        },
        {
            key: 'cat',
            header: t('rep_ef_col_cat_model'),
            className: TOP,
            render: (r) =>
                lines(r, (a) => (
                    <span>
                        {a.category ? personName(a.category, lang) : NONE}
                        {a.model && (
                            <small translate="no" className="text-muted-foreground block text-xs">
                                {a.model}
                            </small>
                        )}
                    </span>
                )),
        },
        {
            key: 'status',
            header: t('rep_ef_col_status'),
            className: TOP,
            render: (r) =>
                lines(r, (a) => {
                    const status = ASSET_STATUS[a.status];
                    return <StatusBadge tone={status?.tone ?? 'gray'}>{status ? t(status.key) : a.status}</StatusBadge>;
                }),
        },
    ];

    return (
        <TopicCard id="ef-asset" title={t('rep_ef_group_asset')} info={[t('rep_ef_info_asset')]} size={<CountLabel n={group.people} unit="people" />}>
            <TopicTable
                caption={t('rep_ef_cap_asset')}
                columns={columns}
                rows={group.rows}
                rowKey={(r) => r.id}
                empty={emptyText(t, narrowed, t('rep_ef_asset_all_clear'))}
            />
        </TopicCard>
    );
}

/* ─────────────────────────── access ─────────────────────────── */

export function AccessCard({ group, narrowed }: { group: EmployeeOpenItemsBreakdown['access']; narrowed: boolean }) {
    const t = useT();
    // The types a person holds, in the Access module's order.
    const typesOf = (row: AccessRowData) =>
        ACCESS_TYPES.map((type) => ({ type, names: row.grants.filter((g) => g.type === type).map((g) => g.name) })).filter((x) => x.names.length > 0);
    const columns: Column<AccessRowData>[] = [
        { key: 'who', header: t('rep_ef_col_leaver'), className: TOP, render: (r) => <PersonCell person={r} /> },
        { key: 'dept', header: t('rep_ef_col_dept'), className: TOP, render: (r) => <DeptCell person={r} /> },
        { key: 'last', header: t('rep_ef_col_last_day'), className: TOP, render: (r) => <LastDayCell person={r} /> },
        {
            key: 'types',
            header: t('rep_ef_col_grants'),
            className: TOP,
            render: (r) => (
                <div className="flex flex-col gap-1.5">
                    {typesOf(r).map(({ type }) => (
                        <div key={type} className="flex min-h-6 items-center gap-1.5 whitespace-nowrap">
                            <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', FILL[TYPE_TONE[type]])} />
                            {t(`rep_ef_type_${type}`)}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: 'detail',
            header: t('rep_ef_col_detail'),
            className: TOP,
            render: (r) => (
                <div className="flex flex-col gap-1.5">
                    {typesOf(r).map(({ type, names }) => (
                        <div key={type} className="flex min-h-6 flex-nowrap items-center gap-1 whitespace-nowrap">
                            {names.map((name) => (
                                <span key={name} translate="no" className="bg-muted rounded-full px-2 py-0.5 text-[11.5px]">
                                    {name}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            ),
        },
    ];

    return (
        <TopicCard
            id="ef-access"
            title={t('rep_ef_group_access')}
            info={[t('rep_ef_info_access_1'), t('rep_ef_info_access_2')]}
            size={<CountLabel n={group.people} unit="people" />}
        >
            <TopicTable
                caption={t('rep_ef_cap_access')}
                columns={columns}
                rows={group.rows}
                rowKey={(r) => r.id}
                empty={emptyText(t, narrowed, t('rep_ef_access_clear'))}
            />
        </TopicCard>
    );
}

/* ─────────────────────────── accounts ─────────────────────────── */

export function AccountCard({ group, narrowed }: { group: NonNullable<EmployeeOpenItemsBreakdown['acct']>; narrowed: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const info =
        group.expiry_days > 0
            ? [t('rep_ef_info_acct_on_1').replace('{n}', count(group.expiry_days, lang)), t('rep_ef_info_acct_no_account')]
            : [t('rep_ef_info_acct_off_1'), t('rep_ef_info_acct_off_2'), t('rep_ef_info_acct_no_account')];
    const columns: Column<AcctRow>[] = [
        {
            key: 'user',
            header: t('rep_ef_col_account'),
            className: TOP,
            render: (r) => (
                <span translate="no" className="font-mono text-[13px] font-medium">
                    {r.username}
                </span>
            ),
        },
        { key: 'who', header: t('rep_ef_col_employee'), className: TOP, render: (r) => (r.employee ? <PersonCell person={r.employee} /> : NONE) },
        { key: 'dept', header: t('rep_ef_col_dept'), className: TOP, render: (r) => (r.employee ? <DeptCell person={r.employee} /> : NONE) },
        { key: 'role', header: t('rep_ef_col_role'), className: TOP, render: (r) => (r.role ? <span translate="no">{r.role}</span> : NONE) },
        {
            key: 'kind',
            header: t('rep_ef_col_acct_status'),
            className: TOP,
            render: (r) => <StatusBadge tone="violet">{t(`rep_ef_acct_kind_${r.kind}`)}</StatusBadge>,
        },
        {
            key: 'changed',
            header: t('rep_ef_col_pw_changed'),
            className: cn(TOP, 'whitespace-nowrap'),
            render: (r) =>
                r.password_changed_at ? (
                    <div>
                        {shortDate(r.password_changed_at, lang)}
                        <div className="text-muted-foreground text-xs">
                            {t('rep_ef_pw_ago').replace('{n}', count(daysSince(r.password_changed_at), lang))}
                        </div>
                    </div>
                ) : (
                    <span className="text-muted-foreground">{t('rep_ef_pw_never')}</span>
                ),
        },
    ];

    return (
        <TopicCard id="ef-acct" title={t('rep_ef_group_acct')} info={info} size={<CountLabel n={group.accounts} unit="accounts" />}>
            <TopicTable
                caption={t('rep_ef_cap_acct')}
                columns={columns}
                rows={group.rows}
                rowKey={(r) => r.user_id}
                empty={emptyText(t, narrowed, t('rep_ef_acct_none'))}
            />
        </TopicCard>
    );
}

/* ─────────────────────────── incomplete data ─────────────────────────── */

/** One issue's chip: the amber topic colour with its dot. */
function IssueChip({ issue }: { issue: DataIssueKey }) {
    const t = useT();
    return <StatusBadge tone="amber">{t(`rep_ef_issue_${issue}`)}</StatusBadge>;
}

export function DataCard({ group, narrowed }: { group: EmployeeOpenItemsBreakdown['data']; narrowed: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    // What each issue adds beside its chip, on the same line.
    const detail = (issue: DataRow['issues'][number]) => {
        if (issue.key === 'mgr_left' && issue.manager?.name) {
            return (
                <>
                    <span translate="no">{personName({ name: issue.manager.name, name_th: issue.manager.name_th }, lang)}</span>
                    {issue.manager.last_day && ` ${t('rep_ef_mgr_last').replace('{date}', shortDate(issue.manager.last_day, lang))}`}
                </>
            );
        }
        if (issue.key === 'bad_dates' && issue.joined_at && issue.last_day) {
            return t('rep_ef_bad_dates').replace('{start}', shortDate(issue.joined_at, lang)).replace('{last}', shortDate(issue.last_day, lang));
        }
        return NONE;
    };
    const columns: Column<DataRow>[] = [
        {
            key: 'who',
            header: t('rep_ef_col_employee'),
            className: TOP,
            render: (r) => <PersonCell person={r} note={r.resigned ? t('rep_ef_resigned') : undefined} />,
        },
        { key: 'dept', header: t('rep_ef_col_dept'), className: TOP, render: (r) => <DeptCell person={r} /> },
        { key: 'pos', header: t('rep_ef_col_position'), className: TOP, render: (r) => (r.position ? <span>{r.position}</span> : NONE) },
        {
            key: 'issues',
            header: t('rep_ef_col_issues'),
            className: TOP,
            render: (r) => (
                <div className="flex min-w-40 flex-col gap-1.5">
                    {r.issues.map((i) => (
                        <div key={i.key} className="flex min-h-6 items-center">
                            <IssueChip issue={i.key} />
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: 'detail',
            header: t('rep_ef_col_detail'),
            className: TOP,
            render: (r) => (
                <div className="flex flex-col gap-1.5 text-[13px]">
                    {r.issues.map((i) => (
                        <div key={i.key} className="flex min-h-6 items-center whitespace-nowrap">
                            {detail(i)}
                        </div>
                    ))}
                </div>
            ),
        },
    ];

    return (
        <TopicCard
            id="ef-data"
            title={t('rep_ef_group_data')}
            info={[t('rep_ef_info_data_1'), t('rep_ef_info_data_2'), t('rep_ef_info_data_3'), t('rep_ef_info_data_4')]}
            size={<CountLabel n={group.people} unit="people" />}
        >
            <TopicTable
                caption={t('rep_ef_cap_data')}
                columns={columns}
                rows={group.rows}
                rowKey={(r) => r.id}
                empty={emptyText(t, narrowed, t('rep_ef_data_none'))}
            />
        </TopicCard>
    );
}
