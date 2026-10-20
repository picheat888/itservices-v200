// Role Groups tab: the groups as a table (search, role filter, sort), the default group for new employees, and the group dialog.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { InfoHint } from '@/shared/components/info-hint';
import { LoadFailed } from '@/shared/components/load-failed';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { cn, toRecordId } from '@/shared/lib/utils';
import { SUPER_ROLE } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ArrowUpDown, Plus, Shield, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { GroupRole } from '../api/permissionApi';
import { useDeleteGroup } from '../hooks/use-delete-group';
import { useGroupRoles, useSetDefaultGroup } from '../hooks/use-permissions';
import { countKey, defaultOffReasonKey, findRole, roleLabel } from '../lib/group-rules';
import { CenteredAlert } from './centered-alert';
import { LockHint } from './group-pane';
import { GroupRoleDialog } from './group-role-dialog';
import { GroupRowMenu } from './group-row-menu';
import { RoleBar } from './role-bar';

const SORTS = ['default_first', 'name_asc', 'name_desc', 'members_desc', 'members_asc'] as const;
type Sort = (typeof SORTS)[number];
const isSort = (v: string): v is Sort => (SORTS as readonly string[]).includes(v);
const ALL = '__all__';
const NONE = '__none__';
// Focus after an alert whose opener is gone: the default-group picker
const defaultGroupTrigger = () => document.getElementById('gr-default');

type DefaultStep = { to: number | null; step: 'confirm' | 'saving' | 'done'; error: unknown };

export function GroupRolesTab() {
    const t = useT();
    const fmtN = useNumberFormat();
    const { user, isSuper } = useAuth();
    const { data, isLoading, isFetching, isError, refetch } = useGroupRoles();
    const setDefaultGroup = useSetDefaultGroup();
    const list = useListParams();
    const [defaultChange, setDefaultChange] = useState<DefaultStep | null>(null);
    const [defaultSaved, setDefaultSaved] = useState<string | null | undefined>(undefined);
    const [saved, setSaved] = useState<{ name: string; members: number } | null>(null);

    const groups = useMemo(() => data?.data ?? [], [data]);
    const defaultGroupId = data?.default_group_id ?? null;
    const defaultGroup = groups.find((g) => g.id === defaultGroupId) ?? null;
    const deleteGroup = useDeleteGroup(defaultGroup);
    const roleOptions = data?.roles ?? [];
    // No role is the base role, as the server ceiling-checks it
    const roleOf = (key: string | null) => findRole(roleOptions, key);
    const myPermissions = new Set(user?.permissions ?? []);
    const defaultOffReason = (g: GroupRole) => {
        const key = defaultOffReasonKey(g, defaultGroupId, roleOf(g.role), isSuper, myPermissions);
        return key ? t(key) : null;
    };

    // List state in the URL: ?search, ?role, ?sort, ?page, ?per; the dialog is ?view=<id> or ?add=1
    const roleFilter = list.get('role');
    const sortParam = list.get('sort');
    const sort: Sort = isSort(sortParam) ? sortParam : 'default_first';
    const viewId = toRecordId(list.get('view') || null);
    const adding = list.get('add') !== '';
    const viewing = viewId !== null ? (groups.find((g) => g.id === viewId) ?? null) : null;
    const dialogOpen = adding || viewing !== null;
    // Opening pushes a history entry so Back closes the dialog
    const dialogs = usePageDialogs();
    const openGroup = (g: GroupRole) => dialogs.open({ view: String(g.id) });
    const openNew = () => dialogs.open({ add: '1' });
    const closeDialog = () => dialogs.close(['view', 'add']);

    const rows = useMemo(() => {
        const byName = (a: GroupRole, b: GroupRole) => a.name.localeCompare(b.name, 'th', { sensitivity: 'base' });
        return groups
            .filter((g) => !roleFilter || g.role === roleFilter)
            .sort((a, b) => {
                if (sort === 'name_desc') return byName(b, a);
                if (sort === 'members_desc' || sort === 'members_asc') {
                    const diff = a.member_count - b.member_count;
                    return (sort === 'members_desc' ? -diff : diff) || byName(a, b);
                }
                if (sort === 'default_first' && (a.id === defaultGroupId) !== (b.id === defaultGroupId)) return a.id === defaultGroupId ? -1 : 1;
                return byName(a, b);
            });
    }, [groups, roleFilter, sort, defaultGroupId]);

    const columns: Column<GroupRole>[] = [
        {
            key: 'name',
            header: t('gr_name'),
            minWidth: '14rem',
            render: (g) => (
                <div className="flex min-w-0 items-center gap-2.5">
                    <TruncText text={g.name} className="font-medium" />
                    {g.id === defaultGroupId && (
                        <StatusBadge tone="blue" dot={false}>
                            {t('gr_default_badge')}
                        </StatusBadge>
                    )}
                    {g.role === SUPER_ROLE && !isSuper && <LockHint text={t('gr_admin_protected')} />}
                </div>
            ),
        },
        {
            key: 'role',
            header: t('gr_role'),
            width: '34%',
            render: (g) => (
                <span className="flex min-w-0 items-center gap-2">
                    <RoleBar color={g.role ? roleOf(g.role)?.color : null} />
                    <span className="truncate">{g.role_label ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'members',
            header: t('gr_col_members'),
            render: (g) =>
                g.member_count > 0 ? (
                    <span className="tabular-nums">{t(countKey('gr_people', g.member_count)).replace('{n}', fmtN(g.member_count))}</span>
                ) : (
                    <span className="text-muted-foreground">{t('gr_no_members')}</span>
                ),
        },
        {
            key: 'actions',
            sticky: 'right',
            header: <span className="sr-only">{t('actions')}</span>,
            width: '64px',
            align: 'right',
            render: (g) => (
                <GroupRowMenu
                    group={g}
                    locked={g.role === SUPER_ROLE && !isSuper}
                    deleteBlocked={g.includes_me ? t('perm_refusal_own_access') : null}
                    onOpen={() => openGroup(g)}
                    onDelete={() => void deleteGroup(g)}
                />
            ),
        },
    ];

    const roleFilterOptions = [
        { value: ALL, label: t('all'), search: t('all') },
        ...roleOptions.map((r) => ({ value: r.key, label: roleLabel(r), search: roleLabel(r) })),
    ];
    const filterCount = (roleFilter ? 1 : 0) + (sort !== 'default_first' ? 1 : 0);
    const fieldLabel = (htmlFor: string, icon: React.ReactNode, label: string) => (
        <label htmlFor={htmlFor} className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
            {icon}
            {label}
        </label>
    );
    const filters = (
        <FilterPopover count={filterCount} onClear={() => list.setParams({ role: null, sort: null, page: null })} resultCount={rows.length}>
            {() => (
                <div className="grid gap-3">
                    <div>
                        {fieldLabel('gr-filter-role', <Shield className="h-3.5 w-3.5" aria-hidden />, t('gr_role'))}
                        <SearchableSelect
                            id="gr-filter-role"
                            active={!!roleFilter}
                            value={roleFilter || ALL}
                            onChange={(v) => list.setFilter('role', v === ALL ? '' : v)}
                            options={roleFilterOptions}
                            searchPlaceholder={t('gr_role_search')}
                        />
                    </div>
                    <div>
                        {fieldLabel('gr-filter-sort', <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />, t('order_by'))}
                        <Select value={sort} onValueChange={(v) => list.setFilter('sort', v === 'default_first' ? '' : v)}>
                            <SelectTrigger
                                id="gr-filter-sort"
                                className={cn(sort !== 'default_first' && 'border-brand/50 bg-brand/5 text-brand font-medium')}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            {/* The menu is portaled outside the filter panel: keep its clicks and keys from closing the panel */}
                            <SelectContent onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                {SORTS.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {t(`gr_sort_${s}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </FilterPopover>
    );

    const askDefault = (value: string) => {
        const to = value === NONE ? null : Number(value);
        // Greyed groups stay focusable so their reason is read out; choosing one does nothing
        const target = groups.find((g) => g.id === to);
        if (target && defaultOffReason(target)) return;
        setDefaultChange({ to, step: 'confirm', error: null });
    };
    const runDefault = async () => {
        if (!defaultChange) return;
        const to = defaultChange.to;
        setDefaultChange({ ...defaultChange, step: 'saving', error: null });
        try {
            await setDefaultGroup.mutateAsync(to);
        } catch (err: unknown) {
            setDefaultChange({ to, step: 'confirm', error: err });
            return;
        }
        setDefaultChange({ to, step: 'done', error: null });
        const name = groups.find((g) => g.id === to)?.name ?? null;
        setTimeout(() => {
            setDefaultChange(null);
            setDefaultSaved(name);
        }, 850);
    };
    const target = defaultChange ? (groups.find((g) => g.id === defaultChange.to) ?? null) : null;
    const defaultLines = target
        ? [
              t('gr_default_to').replace('{name}', target.name),
              ...(defaultGroup ? t('gr_default_replaces').replace('{name}', defaultGroup.name).split('\n') : [t('gr_default_keep')]),
          ]
        : [t('gr_default_none'), t('gr_default_none_hint')];

    // Narrow: [search, filter, add] then the default picker on its own row; 52rem and up: one row, add last
    const defaultPicker = (
        <div className="order-2 flex items-center gap-2 @max-[52rem]:w-full @min-[52rem]:order-1">
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
                <label htmlFor="gr-default">{t('gr_default_short')}</label>
                <InfoHint text={t('perm_default_group_desc')} />
            </span>
            <Select value={defaultGroupId !== null ? String(defaultGroupId) : NONE} onValueChange={askDefault} disabled={setDefaultGroup.isPending}>
                <SelectTrigger id="gr-default" className="w-44">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>
                        <span className="text-muted-foreground">{t('perm_ui_none_set')}</span>
                    </SelectItem>
                    {groups.map((g) => {
                        const offReason = defaultOffReason(g);
                        return offReason ? (
                            <SelectItem
                                key={g.id}
                                value={String(g.id)}
                                aria-disabled
                                className="text-muted-foreground focus:text-muted-foreground items-start"
                            >
                                <span className="flex min-w-0 flex-col">
                                    {g.name}
                                    <span className="max-w-56 text-xs">{offReason}</span>
                                </span>
                            </SelectItem>
                        ) : (
                            <SelectItem key={g.id} value={String(g.id)}>
                                {g.name}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </div>
    );
    // A fragment: both items sit directly in the DataTable toolbar row, so `order` can place them
    const actions = (
        <>
            {defaultPicker}
            <Button onClick={openNew} className="order-1 @min-[52rem]:order-2">
                <Plus className="h-4 w-4" />
                {t('gr_add')}
            </Button>
        </>
    );

    const searched = list.get('search') !== '' || !!roleFilter;

    return (
        <div className="@container p-5">
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(g) => g.id}
                searchPlaceholder={t('gr_search_ph')}
                searchable={(g) => `${g.name} ${g.role_label ?? ''}`}
                onRowClick={openGroup}
                loading={isLoading || (isError && !data && isFetching)}
                emptyState={isError && !data ? <LoadFailed onRetry={() => void refetch()} /> : undefined}
                filters={filters}
                actions={actions}
                paging={list.table.paging}
                search={list.table.search}
                empty={
                    searched
                        ? { kind: 'search', title: t('gr_empty_search'), hint: t('gr_empty_search_hint') }
                        : { kind: 'empty', title: t('perm_empty_groups'), hint: t('perm_empty_groups_hint').replace('{button}', t('gr_add')) }
                }
            />

            <GroupRoleDialog open={dialogOpen} group={viewing} groups={groups} defaultGroup={defaultGroup} onClose={closeDialog} onSaved={setSaved} />

            <CenteredAlert
                open={defaultChange !== null}
                returnFocus={defaultGroupTrigger}
                icon={Users}
                title={t('gr_default_confirm_title')}
                busy={defaultChange?.step === 'saving' || defaultChange?.step === 'done'}
                error={defaultChange?.error}
                onClose={() => setDefaultChange(null)}
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="w-full"
                            disabled={defaultChange?.step !== 'confirm'}
                            onClick={() => setDefaultChange(null)}
                        >
                            {t('cancel')}
                        </Button>
                        <SaveButton
                            className="w-full font-semibold disabled:opacity-100"
                            loading={defaultChange?.step === 'saving'}
                            success={defaultChange?.step === 'done'}
                            disabled={defaultChange?.step !== 'confirm'}
                            onClick={() => void runDefault()}
                        >
                            {t('save')}
                        </SaveButton>
                    </>
                }
            >
                {defaultLines.map((line) => (
                    <span key={line} className="block">
                        {line}
                    </span>
                ))}
            </CenteredAlert>

            <CenteredAlert
                open={defaultSaved !== undefined}
                returnFocus={defaultGroupTrigger}
                icon={ShieldCheck}
                title={t('gr_default_saved_title')}
                onClose={() => setDefaultSaved(undefined)}
                actions={
                    <Button className="w-full font-semibold" onClick={() => setDefaultSaved(undefined)}>
                        {t('perm_ui_ok')}
                    </Button>
                }
            >
                {defaultSaved ? t('gr_default_to').replace('{name}', defaultSaved) : t('gr_default_saved_none')}
            </CenteredAlert>

            <CenteredAlert
                open={saved !== null}
                returnFocus={defaultGroupTrigger}
                icon={ShieldCheck}
                title={t('gr_saved_title')}
                onClose={() => setSaved(null)}
                actions={
                    <Button className="w-full font-semibold" onClick={() => setSaved(null)}>
                        {t('perm_ui_ok')}
                    </Button>
                }
            >
                {saved && t(countKey('gr_saved_desc', saved.members)).replace('{name}', saved.name).replace('{n}', fmtN(saved.members))}
            </CenteredAlert>
        </div>
    );
}
