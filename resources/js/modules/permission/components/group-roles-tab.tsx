// Role Groups tab: the groups as a table (search, role filter, sort), the default group for new employees, and the group dialog.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { InfoHint } from '@/shared/components/info-hint';
import { LoadFailed } from '@/shared/components/load-failed';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { toRecordId } from '@/shared/lib/utils';
import { SUPER_ROLE } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ArrowUpDown, Check, Loader2, Plus, Shield, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { GroupRole } from '../api/permissionApi';
import { useDeleteGroup } from '../hooks/use-delete-group';
import { useGroupRoles, usePermissionMatrix, useSetDefaultGroup } from '../hooks/use-permissions';
import { countKey, isOverCeiling } from '../lib/group-rules';
import { permissionRefusalText } from '../lib/refusal';
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

type DefaultStep = { to: number | null; step: 'confirm' | 'saving' | 'done'; error: string | null };

export function GroupRolesTab() {
    const t = useT();
    const fmtN = useNumberFormat();
    const { user, isSuper } = useAuth();
    const { data, isLoading, isError, refetch } = useGroupRoles();
    const { data: matrix } = usePermissionMatrix();
    const setDefaultGroup = useSetDefaultGroup();
    const list = useListParams();
    const [defaultChange, setDefaultChange] = useState<DefaultStep | null>(null);
    const [defaultSaved, setDefaultSaved] = useState<string | null | undefined>(undefined);
    const [saved, setSaved] = useState<{ name: string; members: number } | null>(null);

    const groups = useMemo(() => data?.data ?? [], [data]);
    const defaultGroupId = data?.default_group_id ?? null;
    const defaultGroup = groups.find((g) => g.id === defaultGroupId) ?? null;
    const deleteGroup = useDeleteGroup(defaultGroup);
    const roleOf = (key: string | null) => matrix?.roles.find((r) => r.value === key);
    const myPermissions = new Set(user?.permissions ?? []);
    // Why a group cannot become the default: the Super admin role, or a role above the caller's own permissions
    const defaultOffReason = (g: GroupRole) => {
        if (g.id === defaultGroupId) return null;
        if (g.role === SUPER_ROLE) return t('gr_default_super_off');
        const role = roleOf(g.role);
        return role && isOverCeiling(role, isSuper, myPermissions) ? t('perm_refusal_grant_ceiling') : null;
    };

    // List state in the URL: ?search, ?role, ?sort, ?page, ?per; the dialog is ?view=<id> or ?add=1
    const roleFilter = list.get('role');
    const sortParam = list.get('sort');
    const sort: Sort = isSort(sortParam) ? sortParam : 'default_first';
    const viewId = toRecordId(list.get('view') || null);
    const adding = list.get('add') !== '';
    const viewing = viewId !== null ? (groups.find((g) => g.id === viewId) ?? null) : null;
    const dialogOpen = adding || viewing !== null;
    const openGroup = (g: GroupRole) => list.setParams({ view: String(g.id), add: null });
    const openNew = () => list.setParams({ add: '1', view: null });
    const closeDialog = () => list.setParams({ view: null, add: null });

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
                    <RoleBar color={roleOf(g.role)?.color} />
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

    const roleOptions = [
        { value: ALL, label: t('all'), search: t('all') },
        ...(matrix?.roles ?? []).map((r) => ({ value: r.value, label: r.label, search: r.label })),
    ];
    const sortOptions = SORTS.map((s) => ({ value: s, label: t(`gr_sort_${s}`), search: t(`gr_sort_${s}`) }));
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
                            options={roleOptions}
                        />
                    </div>
                    <div>
                        {fieldLabel('gr-filter-sort', <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />, t('order_by'))}
                        <SearchableSelect
                            id="gr-filter-sort"
                            active={sort !== 'default_first'}
                            value={sort}
                            onChange={(v) => list.setFilter('sort', v === 'default_first' ? '' : v)}
                            options={sortOptions}
                        />
                    </div>
                </div>
            )}
        </FilterPopover>
    );

    const askDefault = (value: string) => setDefaultChange({ to: value === NONE ? null : Number(value), step: 'confirm', error: null });
    const runDefault = async () => {
        if (!defaultChange) return;
        const to = defaultChange.to;
        setDefaultChange({ ...defaultChange, step: 'saving', error: null });
        try {
            await setDefaultGroup.mutateAsync(to);
        } catch (err: unknown) {
            setDefaultChange({ to, step: 'confirm', error: permissionRefusalText(err, t) });
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

    const actions = (
        <div className="flex flex-wrap items-center gap-2">
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
                                disabled
                                className="text-muted-foreground items-start data-disabled:opacity-100"
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
            <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                {t('gr_add')}
            </Button>
        </div>
    );

    const searched = list.get('search') !== '' || !!roleFilter;

    return (
        <div className="p-5">
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(g) => g.id}
                searchPlaceholder={t('gr_search_ph')}
                searchable={(g) => `${g.name} ${g.role_label ?? ''}`}
                onRowClick={openGroup}
                loading={isLoading}
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
                icon={Users}
                title={t('gr_default_confirm_title')}
                busy={defaultChange?.step === 'saving' || defaultChange?.step === 'done'}
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
                        <Button className="w-full font-semibold" disabled={defaultChange?.step !== 'confirm'} onClick={() => void runDefault()}>
                            {defaultChange?.step === 'saving' ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : defaultChange?.step === 'done' ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('saved')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </Button>
                    </>
                }
            >
                {defaultLines.map((line) => (
                    <span key={line} className="block">
                        {line}
                    </span>
                ))}
                {defaultChange?.error && <span className="text-destructive mt-2 block">{defaultChange.error}</span>}
            </CenteredAlert>

            <CenteredAlert
                open={defaultSaved !== undefined}
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
