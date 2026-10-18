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
import { isDateString, storedDateText, type DateFormatter } from '@/shared/lib/datetime';
import { localName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { ArrowLeftRight, Check, ChevronRight, Eye, LogIn, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuditDetails, AuditEntry, AuditFilters } from '../api/permissionApi';
import { useAuditLogs } from '../hooks/use-permissions';
import { auditEmployeeIds } from '../lib/audit-employee-ids';
import { auditFieldLabel, resolveAuditValue, type AuditLookups } from '../lib/audit-format';
import { splitAuditEntries } from '../lib/audit-members';
import { auditEventLabel } from '../lib/audit-words';
import { actionLabel, moduleLabel } from '../lib/permission-labels';
import { AuditMemberChanges } from './audit-member-changes';

const AUDIT_CATEGORIES = ['created', 'updated', 'deleted', 'workflow', 'auth'];

const HEADING = 'text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase';
const ADDED_WORD = 'text-emerald-700 dark:text-emerald-400';
const REMOVED_WORD = 'text-rose-700 dark:text-rose-400';

/** An icon for the action's leading verb. */
function auditIcon(action: string): typeof Plus {
    const a = action.toLowerCase();
    if (/^(created|registered|submitted|opened|uploaded|imported)/.test(a)) return Plus;
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

/** Every shape the detail panel can draw; a shape left out gets no expand control. */
function hasDetails(d: AuditDetails | null): boolean {
    if (!d) return false;
    return (
        (d.added?.length ?? 0) > 0 ||
        (d.removed?.length ?? 0) > 0 ||
        (d.role_changes?.length ?? 0) > 0 ||
        d.from !== undefined ||
        d.to !== undefined ||
        Object.keys(d.changes ?? {}).length > 0 ||
        (d.items?.length ?? 0) > 0 ||
        Object.keys(d.facts ?? {}).length > 0 ||
        Object.keys(d.snapshot ?? {}).length > 0
    );
}

const isBlank = (v: unknown) => v === null || v === undefined || v === '';

type FieldWords = { label: (field: string) => string; value: (field: string, v: unknown) => unknown };

/** One-line summary under the event, with field labels and resolved names. */
function auditDiffSummary(d: AuditDetails | null, fmt: DateFormatter, words: FieldWords): string | null {
    if (!d) return null;
    // Clipped hard: a value can be a whole email body; the panel shows all of it
    const val = (v: unknown) => {
        if (isBlank(v)) return '—';
        if (isDateString(v)) return storedDateText(v, fmt);
        const s = String(v).replace(/\s+/g, ' ').trim();
        return s.length > 60 ? `${s.slice(0, 60)}…` : s;
    };
    const changes = Object.entries(d.changes ?? {});
    if (changes.length > 0) {
        const [field, { from, to }] = changes[0];
        const head = `${words.label(field)}: ${val(words.value(field, from))} → ${val(words.value(field, to))}`;
        return changes.length > 1 ? `${head}  +${changes.length - 1}` : head;
    }
    const added = d.added?.length ?? 0;
    const removed = d.removed?.length ?? 0;
    if (added || removed) return [added ? `+${added}` : null, removed ? `−${removed}` : null].filter(Boolean).join(' / ');
    if (d.from !== undefined || d.to !== undefined) return `${val(d.from)} → ${val(d.to)}`;
    // Name the first record and count the rest
    const items = d.items ?? [];
    if (items.length > 0) return items.length > 1 ? `${items[0]}  +${items.length - 1}` : items[0];
    const facts = Object.entries(d.facts ?? {});
    if (facts.length > 0) return facts.map(([key, value]) => `${words.label(key)}: ${value}`).join('  ');
    return null;
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
    const snapshotEntries = Object.entries(details.snapshot ?? {}).filter(([, v]) => !isBlank(v));
    const permName = (key: string) => {
        const [mod, act] = key.split('.');
        return `${moduleLabel(mod, lang)} / ${actionLabel(mod, act, lang)}`;
    };

    // A value as text: blank is a muted dash, a date follows the date setting
    const shown = (v: unknown) =>
        isBlank(v) ? <span className="text-muted-foreground">—</span> : isDateString(v) ? storedDateText(v, fmt) : String(v);

    return (
        <div className="bg-accent/20 space-y-3 px-5 py-3">
            {changeEntries.length > 0 && (
                <div className="space-y-1.5">
                    {changeEntries.map(([field, { from, to }]) => {
                        const before = resolveAuditValue(field, from, lookups);
                        const after = resolveAuditValue(field, to, lookups);
                        // Long values stack in a ruled scroll box; short ones keep the old → new row
                        const long = String(before ?? '').length > 80 || String(after ?? '').length > 80;
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
            {(details.from !== undefined || details.to !== undefined) && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground line-through">{shown(details.from)}</span>
                    <ChevronRight aria-hidden className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="font-medium">{shown(details.to)}</span>
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
            {Object.entries(details.facts ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0 truncate text-xs font-medium">{label(key)}</span>
                    <span className="min-w-0 break-words">{value}</span>
                </div>
            ))}
            {/* The deleted row as it stood */}
            {snapshotEntries.length > 0 && (
                <dl className="border-border grid gap-x-6 border-t pt-2 @lg:grid-cols-2">
                    {snapshotEntries.map(([field, value]) => (
                        <div key={field} className="border-border/60 flex items-baseline gap-2 border-b py-1 text-sm">
                            <dt className="text-muted-foreground w-32 shrink-0 truncate text-xs font-medium">{label(field)}</dt>
                            <dd className="min-w-0 break-words">{shown(resolveAuditValue(field, value, lookups))}</dd>
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

    const { data, isLoading, isFetching, isError, refetch } = useAuditLogs(page, perPage, filters);
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
            minWidth: '13rem',
            render: (l) => {
                const Icon = auditIcon(l.action);
                const words: FieldWords = {
                    label: (field) => auditFieldLabel(field, lang, l.subject_type),
                    value: (field, v) => resolveAuditValue(field, v, lookups),
                };
                const summary = auditDiffSummary(l.details, fmt, words);
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
            width: '170px',
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
            width: '200px',
            render: (l) => <TruncText text={l.target} className="text-muted-foreground" />,
        },
        {
            key: 'time',
            header: t('audit_time'),
            width: '112px',
            render: (l) => (
                <span className="text-muted-foreground block truncate text-xs whitespace-nowrap" title={fmt.dateTime(l.created_at)}>
                    {auditAgo(l.created_at, lang, fmt.dateTime(l.created_at))}
                </span>
            ),
        },
        {
            key: 'open',
            header: <span className="sr-only">{t('audit_details')}</span>,
            width: '52px',
            align: 'center',
            render: (l) =>
                hasDetails(l.details) && (
                    // The row opens it; the button names the control and its state
                    <button
                        type="button"
                        aria-expanded={expandedId === l.id}
                        aria-label={t('asset_open_detail')}
                        className={cn(
                            'mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                            expandedId === l.id ? 'text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                    >
                        <Eye aria-hidden className="h-4 w-4" />
                    </button>
                ),
        },
    ];

    return (
        <div className="p-5">
            <DataTable
                columns={columns}
                rows={logs}
                rowKey={(l) => l.id}
                loading={isLoading || isFetching}
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
                onRowClick={(l) => setExpandedId(expandedId === l.id ? null : l.id)}
                isRowClickable={(l) => hasDetails(l.details)}
                rowClassName={(l) => (expandedId === l.id ? 'bg-accent/30' : undefined)}
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
