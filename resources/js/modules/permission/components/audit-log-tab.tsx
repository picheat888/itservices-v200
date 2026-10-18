// Audit Logs tab: the server-paged log on the shared DataTable, with filters and an expandable detail per entry.
import { translate, useT } from '@/lang';
import { useDepartments, useEmployeesByIds, usePositions, useSections } from '@/modules/employee';
import { DataTable, type Column } from '@/shared/components/data-table';
import { LoadFailed } from '@/shared/components/load-failed';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { TruncText } from '@/shared/components/trunc-text';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useListParams } from '@/shared/hooks/use-list-params';
import { localName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { ArrowLeftRight, Check, ChevronRight, Eye, LogIn, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuditEntry, AuditFilters } from '../api/permissionApi';
import { useAuditLogs } from '../hooks/use-permissions';
import { auditDiffSummary, auditFacts, hasAuditDetails, hasAuditMove, isBlankAuditValue } from '../lib/audit-details';
import { auditEmployeeIds } from '../lib/audit-employee-ids';
import { auditFieldLabel, auditValueText, type AuditLookups } from '../lib/audit-format';
import { splitAuditEntries } from '../lib/audit-members';
import { auditEventLabel } from '../lib/audit-words';
import { actionLabel, moduleLabel } from '../lib/permission-labels';
import { AuditMemberChanges } from './audit-member-changes';

const AUDIT_CATEGORIES = ['created', 'updated', 'deleted', 'workflow', 'auth'];

const detailRowId = (entry: AuditEntry) => `audit-detail-${entry.id}`;

const HEADING = 'text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase';
const ADDED_WORD = 'text-emerald-700 dark:text-emerald-400';
const REMOVED_WORD = 'text-rose-700 dark:text-rose-400';

/** An icon for the action's leading verb. */
function auditIcon(action: string): typeof Plus {
    const a = action.toLowerCase();
    if (/^(created|duplicated|registered|submitted|opened|uploaded|imported)/.test(a)) return Plus;
    if (/^(deleted|removed)/.test(a)) return Trash2;
    if (/^rejected/.test(a)) return X;
    if (/^(approved|accepted|received|committed|fulfilled|completed|resolved)/.test(a)) return Check;
    if (/^(signed|changed own|updated own)/.test(a)) return LogIn;
    if (/^stock /.test(a)) return ArrowLeftRight;
    return Pencil;
}

/** Relative time within a day, then the exact system-timezone time passed in. */
function auditAgo(iso: string, lang: Lang, absolute: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return translate(lang, 'perm_ui_just_now');
    if (m < 60) return translate(lang, 'perm_ui_minutes_short').replace('{n}', formatNumber(m, lang));
    const h = Math.floor(m / 60);
    if (h < 24) return translate(lang, 'perm_ui_hours_short').replace('{n}', formatNumber(h, lang));
    return absolute;
}

/** A word heading over a plain comma list (added, removed, records). */
function WordList({ heading, tone, items }: { heading: string; tone?: string; items: ReactNode[] }) {
    return (
        <div className="min-w-0">
            <div className={cn(HEADING, tone)}>{heading}</div>
            <p className="text-sm break-words">
                {items.map((item, i) => (
                    <span key={i}>
                        {i > 0 && ', '}
                        {item}
                    </span>
                ))}
            </p>
        </div>
    );
}

/** The detail panel of one audit entry: field changes, permission and member changes, records, facts, or the deleted row. */
function AuditDetailPanel({ entry, lang, lookups }: { entry: AuditEntry; lang: Lang; lookups: AuditLookups }) {
    const t = useT();
    const fmt = useDateFormat();
    const details = entry.details ?? {};
    const label = (field: string) => auditFieldLabel(field, lang, entry.subject_type);
    const { permissionsAdded, permissionsRemoved, membersAdded, membersRemoved } = splitAuditEntries(details);
    const changeEntries = Object.entries(details.changes ?? {});
    const snapshotEntries = Object.entries(details.snapshot ?? {}).filter(([, v]) => !isBlankAuditValue(v));
    const permName = (key: string) => {
        const [mod, act] = key.split('.');
        return `${moduleLabel(mod, lang)} / ${actionLabel(mod, act, lang)}`;
    };

    const text = (field: string, v: unknown) => auditValueText(field, v, { subjectType: entry.subject_type, lookups, lang, fmt });
    // Blank is a muted dash
    const shown = (value: string | null) => value ?? <span className="text-muted-foreground">—</span>;

    return (
        <div className="border-border/60 mx-5 space-y-3 border-t py-3">
            <div className={HEADING}>{t('audit_details')}</div>
            {changeEntries.length > 0 && (
                <div className="space-y-1.5">
                    {changeEntries.map(([field, { from, to }]) => {
                        const before = text(field, from);
                        const after = text(field, to);
                        // Long values stack in a ruled scroll box; short ones keep the old → new row
                        const long = (before ?? '').length > 80 || (after ?? '').length > 80;
                        const box = 'border-border block max-h-32 overflow-auto rounded border px-2 py-1 text-xs break-all whitespace-pre-wrap';
                        return (
                            <div key={field} className={cn('gap-2 text-sm', long ? 'space-y-1' : 'flex items-center')}>
                                <span className="text-muted-foreground block w-32 shrink-0 truncate text-xs font-medium">{label(field)}</span>
                                {long && <span className="text-muted-foreground block text-[11px]">{t('audit_before')}</span>}
                                <span className={cn('text-muted-foreground', long ? box : 'line-through')}>{shown(before)}</span>
                                {!long && <ChevronRight aria-hidden className="text-muted-foreground h-3.5 w-3.5 shrink-0" />}
                                {long && <span className="text-muted-foreground block text-[11px]">{t('audit_after')}</span>}
                                <span className={cn('font-medium', long && box)}>{shown(after)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            {hasAuditMove(details) && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground line-through">{shown(text('', details.from))}</span>
                    <ChevronRight aria-hidden className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="font-medium">{shown(text('', details.to))}</span>
                </div>
            )}
            {(permissionsAdded.length > 0 || permissionsRemoved.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {permissionsAdded.length > 0 && (
                        <WordList heading={translate(lang, 'perm_ui_log_added')} tone={ADDED_WORD} items={permissionsAdded.map(permName)} />
                    )}
                    {permissionsRemoved.length > 0 && (
                        <WordList heading={translate(lang, 'perm_ui_log_removed')} tone={REMOVED_WORD} items={permissionsRemoved.map(permName)} />
                    )}
                </div>
            )}
            <AuditMemberChanges membersAdded={membersAdded} membersRemoved={membersRemoved} roleChanges={details.role_changes ?? []} />
            {(details.items ?? []).length > 0 && <WordList heading={t('audit_records')} items={details.items ?? []} />}
            {auditFacts(details).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0 truncate text-xs font-medium">{label(key)}</span>
                    <span className="min-w-0 break-words">{shown(text(key, value))}</span>
                </div>
            ))}
            {/* The deleted row as it stood */}
            {snapshotEntries.length > 0 && (
                <dl className="border-border grid gap-x-6 border-t pt-2 @lg:grid-cols-2">
                    {snapshotEntries.map(([field, value]) => (
                        <div key={field} className="border-border/60 flex items-baseline gap-2 border-b py-1 text-sm">
                            <dt className="text-muted-foreground w-32 shrink-0 truncate text-xs font-medium">{label(field)}</dt>
                            <dd className="min-w-0 break-words">{shown(text(field, value))}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

export function AuditLogTab() {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    // Search, filters, page and rows-per-page live in the URL (?search, category, user, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const search = list.get('search');
    const categoryParam = list.get('category');
    const category = AUDIT_CATEGORIES.includes(categoryParam) ? categoryParam : 'all';
    const user = list.get('user') || 'all';
    const sentSearch = useDebouncedSearch(search);
    const filters: AuditFilters = { search: sentSearch, category, user };
    const hasSearchOrFilter = search !== '' || category !== 'all' || user !== 'all';

    const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useAuditLogs(page, perPage, filters);
    const logs = isError ? [] : (data?.data ?? []);
    const meta = data?.meta;

    // Reference data to turn older raw foreign-key ids in diffs into entity names.
    const { data: positions = [] } = usePositions();
    const { data: departments = [] } = useDepartments();
    const { data: sections = [] } = useSections();
    const { data: employees = [] } = useEmployeesByIds(auditEmployeeIds(logs));
    const lookups = useMemo<AuditLookups>(
        () => ({
            positions: new Map(positions.map((p) => [p.id, p.title])),
            departments: new Map(departments.map((d) => [d.id, localName(d, lang)])),
            sections: new Map(sections.map((s) => [s.id, localName(s, lang)])),
            employees: new Map(employees.map((e) => [e.id, localName(e, lang)])),
        }),
        [positions, departments, sections, employees, lang],
    );

    // A ?user= naming nobody in the log falls back to all users.
    const unknownUser = meta?.users !== undefined && user !== 'all' && !meta.users.includes(user);
    useEffect(() => {
        if (unknownUser) list.setFilter('user', '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unknownUser]);

    // A filter, search or page change folds any open row.
    const setFilter = (key: 'search' | 'category' | 'user', value: string) => {
        list.setFilter(key, value === 'all' ? '' : value);
        setExpandedId(null);
    };
    const paging = list.table.paging;
    const toggleRow = (id: number) => setExpandedId((open) => (open === id ? null : id));

    const categoryOptions = [
        { value: 'all', label: translate(lang, 'perm_ui_all_actions') },
        { value: 'created', label: translate(lang, 'perm_ui_log_created') },
        { value: 'updated', label: translate(lang, 'perm_ui_log_updated') },
        { value: 'deleted', label: translate(lang, 'perm_ui_log_deleted') },
        { value: 'workflow', label: translate(lang, 'perm_ui_log_workflow') },
        { value: 'auth', label: translate(lang, 'perm_ui_log_auth') },
    ].map((o) => ({ ...o, search: o.label }));
    const userOptions = [
        { value: 'all', label: translate(lang, 'perm_ui_all_users'), search: '' },
        ...(meta?.users ?? []).map((u) => ({ value: u, label: u, search: u })),
    ];

    const columns: Column<AuditEntry>[] = [
        {
            key: 'action',
            header: t('audit_action'),
            minWidth: '10rem',
            render: (l) => {
                const Icon = auditIcon(l.action);
                const summary = auditDiffSummary(l.details, {
                    label: (field) => auditFieldLabel(field, lang, l.subject_type),
                    value: (field, v) => auditValueText(field, v, { subjectType: l.subject_type, lookups, lang, fmt }) ?? '',
                });
                return (
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <Icon aria-hidden className="text-muted-foreground h-4 w-4 shrink-0" />
                            <TruncText text={auditEventLabel(l.action, t)} className="font-medium" />
                        </div>
                        {summary && (
                            <div className="pl-6">
                                <TruncText text={summary} className="text-muted-foreground text-xs" />
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'user',
            header: t('audit_user'),
            width: 'var(--audit-user-w)',
            render: (l) => (
                <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={l.user_name} className="h-7 w-7 shrink-0" textClassName="text-[10px]" />
                    <TruncText text={l.user_name} />
                </div>
            ),
        },
        {
            key: 'target',
            header: t('audit_target'),
            width: 'var(--audit-target-w)',
            render: (l) => <TruncText text={l.target} className="text-muted-foreground" />,
        },
        {
            key: 'time',
            header: t('audit_time'),
            width: '132px',
            render: (l) => (
                <span className="text-muted-foreground block truncate text-xs whitespace-nowrap" title={fmt.dateTime(l.created_at)}>
                    {auditAgo(l.created_at, lang, fmt.dateTime(l.created_at))}
                </span>
            ),
        },
        {
            key: 'open',
            sticky: 'right',
            header: <span className="sr-only">{t('audit_details')}</span>,
            width: '44px',
            align: 'center',
            className: 'px-1',
            render: (l) =>
                hasAuditDetails(l.details) && (
                    // The Tab stop of the row; a click anywhere on the row toggles too
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleRow(l.id);
                        }}
                        aria-expanded={expandedId === l.id}
                        aria-controls={expandedId === l.id ? detailRowId(l) : undefined}
                        aria-label={t('asset_open_detail')}
                        className={cn(
                            'mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9',
                            expandedId === l.id ? 'text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                    >
                        <Eye aria-hidden className="h-4 w-4" />
                    </button>
                ),
        },
    ];

    // User and target widths: narrower below xl so a tablet fits without scrolling
    return (
        <div className="p-5 [--audit-target-w:120px] [--audit-user-w:128px] xl:[--audit-target-w:200px] xl:[--audit-user-w:170px]">
            <DataTable
                columns={columns}
                rows={logs}
                rowKey={(l) => l.id}
                loading={isLoading || (isFetching && isPlaceholderData)}
                searchable={() => ''}
                searchPlaceholder={t('perm_audit_search')}
                search={{ value: search, onChange: (value) => setFilter('search', value) }}
                server={{
                    ...paging,
                    total: isError ? 0 : (meta?.total ?? 0),
                    onPageChange: (next) => {
                        paging.onPageChange(next);
                        setExpandedId(null);
                    },
                    onPageSizeChange: (size) => {
                        paging.onPageSizeChange(size);
                        setExpandedId(null);
                    },
                }}
                filters={
                    <>
                        <div className="w-44">
                            <label htmlFor="audit-filter-category" className="sr-only">
                                {t('perm_audit_filter_category')}
                            </label>
                            <SearchableSelect
                                id="audit-filter-category"
                                active={category !== 'all'}
                                value={category}
                                onChange={(v) => setFilter('category', v)}
                                options={categoryOptions}
                            />
                        </div>
                        <div className="w-44">
                            <label htmlFor="audit-filter-user" className="sr-only">
                                {t('audit_user')}
                            </label>
                            <SearchableSelect
                                id="audit-filter-user"
                                active={user !== 'all'}
                                value={user}
                                onChange={(v) => setFilter('user', v)}
                                options={userOptions}
                            />
                        </div>
                    </>
                }
                onRowClick={(l) => toggleRow(l.id)}
                isRowClickable={(l) => hasAuditDetails(l.details)}
                focusableRows={false}
                rowClassName={(l) => (expandedId === l.id ? 'border-b-0' : undefined)}
                expandedRowId={detailRowId}
                renderExpanded={(l) => (expandedId === l.id && l.details ? <AuditDetailPanel entry={l} lang={lang} lookups={lookups} /> : null)}
                emptyState={isError ? <LoadFailed onRetry={() => void refetch()} /> : undefined}
                empty={
                    hasSearchOrFilter
                        ? { kind: 'search', title: t('perm_empty_audit_search'), hint: t('perm_empty_audit_search_hint') }
                        : { kind: 'empty', title: t('perm_empty_audit'), hint: t('perm_empty_audit_hint') }
                }
            />
        </div>
    );
}
