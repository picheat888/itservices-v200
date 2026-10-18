import { translate, useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useDepartments, useEmployeesByIds, usePositions, useSections } from '@/modules/employee';
import { PAGE_SIZES } from '@/shared/components/data-table';
import { EmptyState } from '@/shared/components/empty-state';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ListSkeleton, TableSkeleton } from '@/shared/components/skeletons';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useHeldHeight } from '@/shared/hooks/use-held-height';
import { useListParams, usePageInRange } from '@/shared/hooks/use-list-params';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { useTableFitsWidth } from '@/shared/hooks/use-table-fits-width';
import { isDateString, storedDateText, type DateFormatter } from '@/shared/lib/datetime';
import { localName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING, TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import {
    ArrowLeftRight,
    Briefcase,
    Check,
    ChevronLeft,
    ChevronRight,
    Eye,
    LayoutDashboard,
    Loader2,
    Lock,
    LogIn,
    Pencil,
    PencilLine,
    Plus,
    Save,
    Search,
    Shield,
    ShieldCheck,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AuditDetails, AuditFilters, RoleRow } from '../api/permissionApi';
import { ACCESS_COUNT, AccessPermissionTree } from '../components/access-permission-tree';
import { ASSET_COUNT, AssetPermissionTree } from '../components/asset-permission-tree';
import { AuditMemberChanges } from '../components/audit-member-changes';
import { CenteredAlert } from '../components/centered-alert';
import { CONTRACT_COUNT, ContractPermissionTree } from '../components/contract-permission-tree';
import { EMPLOYEE_COUNT, EmployeePermissionTree } from '../components/employee-permission-tree';
import { GroupRolesTab } from '../components/group-roles-tab';
import { moduleCardSpec, ModulePermissionCard, type ModuleMaster } from '../components/module-permission-card';
import { NOTIFICATION_COUNT, NotificationPermissionTree } from '../components/notification-permission-tree';
import { CHANGED_TEXT, PermissionCard, PermissionCell, PermissionViewProvider, PlainRow, spreadRows } from '../components/permission-layout';
import { ProfilePermissionTree } from '../components/profile-permission-tree';
import { REPORT_COUNT, ReportPermissionTree } from '../components/report-permission-tree';
import { REQUEST_COUNT, RequestPermissionTree } from '../components/request-permission-tree';
import { RoleBar } from '../components/role-bar';
import { RoleModal } from '../components/role-modal';
import { STOCK_COUNT, StockPermissionTree } from '../components/stock-permission-tree';
import { TICKET_COUNT, TicketPermissionTree } from '../components/ticket-permission-tree';
import { WORKFLOW_COUNT, WorkflowPermissionTree } from '../components/workflow-permission-tree';
import { useAuditLogs, usePermissionMatrix, useRoleMutations, useUpdateRolePermissions } from '../hooks/use-permissions';
import { auditEmployeeIds } from '../lib/audit-employee-ids';
import { auditFieldLabel, resolveAuditValue, type AuditLookups } from '../lib/audit-format';
import { splitAuditEntries } from '../lib/audit-members';
import { countGranted, hiddenHitCount, specKeys, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { isRoleChanged, permissionRefusalText } from '../lib/refusal';

/** The tab slugs, which are also what ?tab= carries — no mapping layer to keep in step. */
const TABS = ['templates', 'groups', 'logs'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
// URL keys of the Logs and Role Groups lists; cleared when the tab changes.
const TAB_LIST_KEYS = ['search', 'category', 'user', 'page', 'role', 'sort', 'view', 'add'];

/** Permission each tab's own endpoints require. */
const TAB_PERMISSION: Record<Tab, string> = {
    templates: 'system.manage_roles',
    groups: 'system.manage_groups',
    logs: 'system.view_audit',
};

export default function PermissionsPage() {
    const t = useT();
    const { can } = useAuth();
    const allowed = TABS.filter((id) => can(TAB_PERMISSION[id]));
    const isAllowedTab = (v: string | null): v is Tab => isTab(v) && allowed.includes(v);

    // Active tab in ?tab= (useTabParam); an unknown or forbidden tab falls back to the first allowed one
    const [allowedTab, setTab] = useTabParam(isAllowedTab, allowed[0] ?? 'templates');
    const tab: Tab | null = allowed.length > 0 ? allowedTab : null;
    // Unsaved role-permission draft; leaving the matrix tab asks first.
    const [rolesDirty, setRolesDirty] = useState(false);
    const guardTabSwitch = useDiscardGuard(tab === 'templates' && rolesDirty);
    const changeTab = (next: Tab) => {
        if (next === tab) return;
        guardTabSwitch(() => setTab(next, { extra: (params) => TAB_LIST_KEYS.forEach((key) => params.delete(key)) }));
    };

    const labels: Record<Tab, string> = { templates: t('perm_roles'), groups: t('perm_groups'), logs: t('perm_audit') };
    const tabs = allowed.map((id) => ({ id, label: labels[id] }));

    return (
        <div className="space-y-6">
            <div className="mb-3">
                <h1 className="text-2xl font-bold">{t('permissions')}</h1>
                <p className="text-muted-foreground text-sm">{t('perm_sub')}</p>
            </div>

            <Card className="overflow-clip p-0">
                <div className="border-border flex gap-1 border-b px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => changeTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb.label}
                        </button>
                    ))}
                </div>

                {tab === 'templates' && <RolesTab onDirtyChange={setRolesDirty} />}
                {tab === 'groups' && <GroupRolesTab />}
                {tab === 'logs' && <AuditTab />}
                {tab === null && <EmptyState kind="denied" title={t('perm_empty_no_tabs')} hint={t('perm_empty_no_tabs_hint')} />}
            </Card>
        </div>
    );
}

// Permission modules grouped like the sidebar (Workspace / Administration)
const PERM_SECTIONS: { label: string; icon: React.ComponentType<{ className?: string }>; modules: string[] }[] = [
    { label: 'nav_overview', icon: LayoutDashboard, modules: ['dashboard'] },
    { label: 'nav_workspace', icon: Briefcase, modules: ['tickets', 'requests', 'assets', 'contracts', 'stock', 'employees', 'access', 'profile'] },
    // `workflows` sits under ADMIN_GROUPS, as in the sidebar
    { label: 'nav_admin', icon: Shield, modules: ['system'] },
];

// Administration cards: live system.* keys plus "coming soon" placeholders
const ADMIN_GROUPS: { module: string; keys: string[] }[] = [
    {
        module: 'reports',
        keys: [
            'reports.module',
            'reports.tickets',
            'reports.assets',
            'reports.contracts',
            'reports.stock',
            'reports.requests',
            'reports.employees',
            'reports.access',
            'reports.export',
            'reports.schedule',
        ],
    },
    { module: 'workflows', keys: ['workflows.module', 'workflows.manage'] },
    { module: 'permissions', keys: ['system.manage_permissions', 'system.manage_roles', 'system.manage_groups', 'system.view_audit'] },
    {
        module: 'notifications',
        keys: [
            'notifications.module',
            'notifications.email_edit',
            'notifications.email_toggle',
            'notifications.email_test',
            'notifications.inapp_edit',
            'notifications.inapp_toggle',
            'notifications.inapp_test',
            'notifications.logs',
        ],
    },
    {
        module: 'settings',
        keys: [
            'settings.access',
            'settings.company',
            'settings.system',
            'settings.masterdata',
            'settings.email',
            'settings.sla',
            'settings.requestdata',
            'settings.assets',
            'settings.security',
        ],
    },
];

// Administration modules drawn as the Stock-style card with a master switch
const ADMIN_CARD_META: Record<string, { subtitleKey: string; master: ModuleMaster }> = {
    permissions: {
        subtitleKey: 'perm_ui_permissions_card_sub',
        master: { mode: 'key', key: 'system.manage_permissions' },
    },
    settings: {
        subtitleKey: 'perm_ui_settings_card_sub',
        master: { mode: 'key', key: 'settings.access' },
    },
};

// Cards drawn by their own tree component, with the tree's count spec
const TREE_COUNT: Record<string, CountSpec> = {
    stock: STOCK_COUNT,
    employees: EMPLOYEE_COUNT,
    contracts: CONTRACT_COUNT,
    assets: ASSET_COUNT,
    tickets: TICKET_COUNT,
    workflows: WORKFLOW_COUNT,
    requests: REQUEST_COUNT,
    notifications: NOTIFICATION_COUNT,
    reports: REPORT_COUNT,
    access: ACCESS_COUNT,
};

/** The count spec a card is drawn with; flat cards count live keys only. */
function cardSpec(group: { module: string; keys: string[] }): { spec: CountSpec; liveOnly: boolean } {
    const tree = TREE_COUNT[group.module];
    if (tree) return { spec: tree, liveOnly: false };
    if (group.module === 'profile') return { spec: { free: group.keys }, liveOnly: false };
    const meta = ADMIN_CARD_META[group.module];
    return { spec: meta ? moduleCardSpec(group.keys, meta.master) : { free: group.keys }, liveOnly: true };
}

function RolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { data, isLoading, isError, refetch } = usePermissionMatrix();
    const update = useUpdateRolePermissions();
    const roleMut = useRoleMutations();
    const [searchParams, setSearchParams] = useSearchParams();
    const [draft, setDraft] = useState<Set<string>>(new Set());
    const [roleModal, setRoleModal] = useState<{ open: boolean; role: RoleRow | null }>({ open: false, role: null });
    const [query, setQuery] = useState('');
    // Save flow: centred confirm (count frozen at open), ✓ flash, then the saved notice
    const [saveStep, setSaveStep] = useState<'idle' | 'confirm' | 'saving' | 'done'>('idle');
    const [pending, setPending] = useState(0);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saved, setSaved] = useState<{ label: string; members: number } | null>(null);

    const roles = data?.roles ?? [];
    // Selected role in ?role= (the first role is the bare URL); an unknown key falls back to the first
    const role: RoleRow | undefined = roles.find((r) => r.value === searchParams.get('role')) ?? roles[0];
    const selectRole = (key: string) =>
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (key === roles[0]?.value) params.delete('role');
            else params.set('role', key);
            return params;
        });

    // Retired keys a role still holds stay out of the draft so the save passes server validation
    const catalogKeys = useMemo(
        () => new Set(Object.entries(data?.catalog ?? {}).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`))),
        [data],
    );
    const heldKeys = (r: RoleRow) => new Set(r.permissions.filter((p) => catalogKeys.has(p)));

    /** Delete a role template, or say up front why the API would refuse it. */
    const handleDeleteRole = (r: RoleRow) => {
        const blocked = r.is_system
            ? t('role_del_blocked_system')
            : r.members > 0
              ? t('role_del_blocked_members').replace('{n}', fmtN(r.members))
              : r.groups > 0
                ? t('role_del_blocked_group').replace('{n}', fmtN(r.groups))
                : null;

        if (blocked) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('role_del_blocked_title'),
                description: blocked,
                // Nothing to agree to here — the one button acknowledges a refusal.
                confirmText: t('role_del_blocked_ack'),
            });
            return;
        }

        void confirm({ variant: 'danger', entity: { name: r.label }, action: () => roleMut.remove.mutateAsync(r.value) });
    };

    const original = useMemo(() => new Set(role ? role.permissions.filter((p) => catalogKeys.has(p)) : []), [role, catalogKeys]);
    // Keys whose saved state differs from the draft; drives the orange labels and the unsaved count.
    const changedKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const p of draft) if (!original.has(p)) keys.add(p);
        for (const p of original) if (!draft.has(p)) keys.add(p);
        return keys;
    }, [draft, original]);
    const dirty = changedKeys.size > 0;
    const guardRoleSwitch = useDiscardGuard(dirty);
    // Links, Back and Forward that leave the page, the tab or the role ask first
    useNavigationGuard(dirty, ['tab', 'role']);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    // Seed the draft and its version for a newly selected role; a refetch only re-seeds while nothing is unsaved
    const seededFor = useRef<string | null>(null);
    const draftVersion = useRef('');
    const adoptVersion = useRef(false);
    useEffect(() => {
        if (!role) return;
        if (seededFor.current === role.value && dirty) {
            // After a 409 the reload brings the stored side; the kept draft saves against it
            if (adoptVersion.current) draftVersion.current = role.version;
            adoptVersion.current = false;
            return;
        }
        seededFor.current = role.value;
        draftVersion.current = role.version;
        adoptVersion.current = false;
        setDraft(heldKeys(role));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.value, data]);

    // The saved notice follows the ✓ beat; a tab left mid-beat drops it
    const doneTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(doneTimer.current), []);
    const pickerId = useId();

    // A refused or failed load says so
    if (isError) return <div className="text-muted-foreground p-10 text-center text-sm">{t('perm_load_failed')}</div>;

    if (isLoading || !data || !role) return <RolesSkeleton />;

    const toggle = (key: string) => {
        if (role.is_super) return;
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Sections from the catalog; unmapped modules go to a trailing "Other"
    const sections = PERM_SECTIONS.map((s) => ({ label: s.label, icon: s.icon, modules: s.modules.filter((m) => data.catalog[m]) })).filter(
        (s) => s.modules.length > 0,
    );
    // Modules already in the Administration cards stay out of "Other"
    const knownModules = new Set([...PERM_SECTIONS.flatMap((s) => s.modules), ...ADMIN_GROUPS.map((g) => g.module)]);
    const leftover = Object.keys(data.catalog).filter((m) => !knownModules.has(m));
    if (leftover.length > 0) sections.push({ label: 'perm_other', icon: Shield, modules: leftover });

    // Held = in the draft (super holds all); flat cards count only live keys
    const has = (key: string) => role.is_super || draft.has(key);
    const liveHas = (key: string) => isLivePermission(key) && has(key);
    const tally = (group: { module: string; keys: string[] }) => {
        const { spec, liveOnly } = cardSpec(group);
        return countGranted(spec, liveOnly ? liveHas : has);
    };

    const keyLabel = (key: string) => {
        const [mod, action] = key.split('.');
        return actionLabel(mod, action, lang);
    };
    const q = query.trim().toLowerCase();
    const isHit = (key: string) => q !== '' && keyLabel(key).toLowerCase().includes(q);
    const matches = (group: { module: string; keys: string[] }) =>
        !q || moduleLabel(group.module, lang).toLowerCase().includes(q) || specKeys(cardSpec(group).spec).some(isHit);
    const searchPlaceholder = t('perm_search_ph');

    const sectionViews = sections
        .map((section) => {
            // Workspace cards come from the backend catalog; Administration is the fixed card split.
            const groups =
                section.label === 'nav_admin'
                    ? ADMIN_GROUPS
                    : section.modules.map((m) => ({ module: m, keys: data.catalog[m].map((a) => `${m}.${a}`) }));
            return { section, groups, shown: groups.filter(matches) };
        })
        .filter((s) => s.shown.length > 0);
    // Hits each card keeps behind its off master, for the master band
    const hiddenHits = new Map(
        sectionViews.flatMap(({ shown }) =>
            shown.map((g) => {
                const { spec, liveOnly } = cardSpec(g);
                return [g.module, hiddenHitCount(spec, liveOnly ? liveHas : has, isHit)] as const;
            }),
        ),
    );

    // Role list and tablet picker share one guarded switch; it pushes ?role= so Back steps through roles
    const switchRole = (key: string) => {
        if (key !== role.value) guardRoleSwitch(() => selectRole(key));
    };
    const roleOptions = roles.map((r) => ({ value: r.value, label: r.label, search: r.label, icon: <RoleBar color={r.color} className="h-4" /> }));

    const openSave = () => {
        setPending(changedKeys.size);
        setSaveError(null);
        setSaveStep('confirm');
    };
    const runSave = async () => {
        setSaveError(null);
        setSaveStep('saving');
        try {
            const fresh = await update.mutateAsync({ role: role.value, permissions: [...draft], version: draftVersion.current });
            // The draft takes the stored set, so the refetch guard sees nothing unsaved
            const stored = fresh.roles.find((r) => r.value === role.value);
            if (stored) {
                draftVersion.current = stored.version;
                setDraft(heldKeys(stored));
            }
        } catch (err: unknown) {
            setSaveError(permissionRefusalText(err, t));
            setSaveStep('confirm');
            // Someone else saved this role: reload it, keeping the draft
            if (isRoleChanged(err)) {
                adoptVersion.current = true;
                void refetch();
            }
            return;
        }
        // Same beat as the shared confirm's success check, then the saved notice
        setSaveStep('done');
        const savedRole = { label: role.label, members: role.members };
        doneTimer.current = window.setTimeout(() => {
            setSaveStep('idle');
            setSaved(savedRole);
        }, 850);
    };

    const renderCard = (group: { module: string; keys: string[] }) => {
        const tree = { draft, setDraft, isSuper: role.is_super, lang };
        if (group.module === 'stock') return <StockPermissionTree key={group.module} {...tree} />;
        if (group.module === 'employees') return <EmployeePermissionTree key={group.module} {...tree} />;
        if (group.module === 'contracts') return <ContractPermissionTree key={group.module} {...tree} />;
        if (group.module === 'assets') return <AssetPermissionTree key={group.module} {...tree} />;
        if (group.module === 'profile') return <ProfilePermissionTree key={group.module} keys={group.keys} {...tree} />;
        if (group.module === 'tickets') return <TicketPermissionTree key={group.module} {...tree} />;
        if (group.module === 'workflows') return <WorkflowPermissionTree key={group.module} {...tree} />;
        if (group.module === 'requests') return <RequestPermissionTree key={group.module} {...tree} />;
        if (group.module === 'notifications') return <NotificationPermissionTree key={group.module} {...tree} />;
        if (group.module === 'reports') return <ReportPermissionTree key={group.module} {...tree} />;
        if (group.module === 'access') return <AccessPermissionTree key={group.module} {...tree} />;
        const cardMeta = ADMIN_CARD_META[group.module];
        if (cardMeta) {
            return (
                <ModulePermissionCard
                    key={group.module}
                    module={group.module}
                    keys={group.keys}
                    subtitle={translate(lang, cardMeta.subtitleKey)}
                    master={cardMeta.master}
                    {...tree}
                />
            );
        }
        // Plain card (Dashboard): every switch stands alone, spread over the cells
        const { on, total } = tally(group);
        return (
            <PermissionCard key={group.module} module={group.module} on={on} total={total} keys={group.keys} lang={lang}>
                {spreadRows(group.keys).map((cell) => (
                    <PermissionCell key={cell[0]}>
                        {cell.map((key) => {
                            const [mod, action] = key.split('.');
                            const live = isLivePermission(key);
                            return (
                                <PlainRow
                                    key={key}
                                    pkey={key}
                                    lang={lang}
                                    dimOff
                                    label={keyLabel(key)}
                                    info={actionDescription(mod, action, lang)}
                                    comingSoon={!live}
                                    on={liveHas(key)}
                                    locked={role.is_super || !live}
                                    onToggle={() => {
                                        if (live) toggle(key);
                                    }}
                                />
                            );
                        })}
                    </PermissionCell>
                ))}
            </PermissionCard>
        );
    };

    return (
        <PermissionViewProvider value={{ changed: (key) => changedKeys.has(key), query, hiddenHits: (module) => hiddenHits.get(module) ?? 0 }}>
            <div className="border-border flex items-center justify-between border-b p-3">
                <span className="text-muted-foreground text-sm">{translate(lang, 'perm_ui_all_templates')}</span>
                <Button onClick={() => setRoleModal({ open: true, role: null })}>
                    <Plus className="h-4 w-4" />
                    {t('perm_new_role')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                {/* Role list; below lg the sticky header's picker stands in for it */}
                <div className="border-border hidden border-r lg:block">
                    {roles.map((r) => (
                        <div
                            key={r.value}
                            className={cn(
                                'group border-border hover:bg-accent/50 flex items-center justify-between border-b transition-colors',
                                r.value === role.value && 'bg-brand/10',
                            )}
                        >
                            <button
                                type="button"
                                aria-current={r.value === role.value ? 'true' : undefined}
                                onClick={() => switchRole(r.value)}
                                className="flex min-w-0 flex-1 items-center gap-2 py-3.5 pl-4 text-left"
                            >
                                <RoleBar color={r.color} className="h-6" />
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand')}>{r.label}</span>
                            </button>
                            {!r.is_system && (
                                <RoleRowActions
                                    role={r}
                                    onEdit={() => setRoleModal({ open: true, role: r })}
                                    onDelete={() => handleDeleteRole(r)}
                                    className="pointer-events-none pr-4 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100"
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="min-w-0 px-5 pb-5">
                    {/* Role header: sticks while the cards scroll, so Save is always in reach */}
                    <div className="bg-card border-border sticky top-[var(--sticky-top,0px)] z-10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4">
                        <div className="min-w-0">
                            <div className="hidden text-lg font-bold lg:block">{role.label}</div>
                            {/* Below lg: the role list as a picker, with the chosen role's edit and delete */}
                            <div className="mb-1 flex items-center gap-1 lg:hidden">
                                <label htmlFor={pickerId} className="sr-only">
                                    {t('perm_roles')}
                                </label>
                                <div className="w-64 max-w-full">
                                    <SearchableSelect
                                        id={pickerId}
                                        value={role.value}
                                        onChange={switchRole}
                                        options={roleOptions}
                                        searchPlaceholder={t('gr_role_search')}
                                    />
                                </div>
                                {!role.is_system && (
                                    <RoleRowActions
                                        role={role}
                                        onEdit={() => setRoleModal({ open: true, role })}
                                        onDelete={() => handleDeleteRole(role)}
                                    />
                                )}
                            </div>
                            <div className="text-muted-foreground text-xs">
                                {role.is_super ? t('perm_super_locked') : `${fmtN(draft.size)} ${t('perm_enabled')}`}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="relative w-72 max-w-full">
                                <Search
                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                    aria-hidden
                                />
                                <Input
                                    type="search"
                                    name="perm-search"
                                    autoComplete="off"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    aria-label={searchLabel(searchPlaceholder)}
                                    className="pl-9 text-ellipsis"
                                />
                            </div>
                            {/* Amber badge where Save stands: the role is protected, not wrong */}
                            {role.is_super ? (
                                <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
                                    <Lock className="h-3.5 w-3.5 shrink-0" />
                                    {t('perm_super_readonly')}
                                </span>
                            ) : (
                                <div className="flex flex-col items-end gap-1">
                                    <span
                                        role="status"
                                        aria-live="polite"
                                        className={cn('text-muted-foreground flex items-center gap-1.5 text-xs leading-4', !dirty && 'invisible')}
                                    >
                                        <span className="h-2 w-2 rounded-full bg-orange-600 dark:bg-orange-400" aria-hidden />
                                        {t('perm_ui_unsaved')} <b className="text-foreground font-semibold tabular-nums">{fmtN(changedKeys.size)}</b>
                                    </span>
                                    <Button disabled={!dirty || update.isPending} onClick={openSave}>
                                        <Save className="h-4 w-4" />
                                        {t('perm_save')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {sectionViews.map(({ section, groups, shown }) => {
                            const SectionIcon = section.icon;
                            const sectionActions = groups.flatMap((g) => specKeys(cardSpec(g).spec));
                            const sectionCount = groups
                                .map(tally)
                                .reduce((sum, c) => ({ on: sum.on + c.on, total: sum.total + c.total }), { on: 0, total: 0 });
                            return (
                                <div key={section.label}>
                                    <div className="border-border mb-3 flex items-center gap-2 border-b pb-1.5">
                                        <SectionIcon className="text-muted-foreground h-4 w-4" />
                                        <span className="text-foreground text-sm font-bold">{t(section.label)}</span>
                                        <span
                                            className={cn(
                                                'text-muted-foreground ml-auto text-xs tabular-nums',
                                                sectionActions.some((k) => changedKeys.has(k)) && CHANGED_TEXT,
                                            )}
                                        >
                                            {fmtN(sectionCount.on)} / {fmtN(sectionCount.total)}
                                        </span>
                                    </div>
                                    {/* Full-width cards; each lays its switches in ruled cells */}
                                    <div className="space-y-4">{shown.map(renderCard)}</div>
                                </div>
                            );
                        })}
                        {sectionViews.length === 0 && <EmptyState kind="search" title={t('perm_search_none').replace('{q}', query.trim())} />}
                    </div>
                </div>
            </div>

            <RoleModal open={roleModal.open} onClose={() => setRoleModal({ open: false, role: null })} role={roleModal.role} />

            <CenteredAlert
                open={saveStep !== 'idle'}
                icon={PencilLine}
                title={t('perm_confirm_title')}
                busy={saveStep === 'saving' || saveStep === 'done'}
                onClose={() => setSaveStep('idle')}
                actions={
                    <>
                        <Button variant="outline" className="w-full" disabled={saveStep !== 'confirm'} onClick={() => setSaveStep('idle')}>
                            {t('cancel')}
                        </Button>
                        <Button className="w-full font-semibold" disabled={saveStep !== 'confirm'} onClick={runSave}>
                            {saveStep === 'saving' ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : saveStep === 'done' ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('saved')}
                                </>
                            ) : (
                                t('perm_save')
                            )}
                        </Button>
                    </>
                }
            >
                <span className="block">{t('perm_confirm_role').replace('{name}', role.label)}</span>
                <span className="block">{t('perm_confirm_count').replace('{n}', fmtN(pending))}</span>
                {saveError && (
                    <span role="alert" className="text-destructive mt-2 block">
                        {saveError}
                    </span>
                )}
            </CenteredAlert>

            <CenteredAlert
                open={saved !== null}
                icon={ShieldCheck}
                title={t('perm_saved_title')}
                onClose={() => setSaved(null)}
                actions={
                    <Button className="w-full font-semibold" onClick={() => setSaved(null)}>
                        {t('perm_ui_ok')}
                    </Button>
                }
            >
                {saved &&
                    (saved.members > 0
                        ? t('perm_saved_desc').replace('{name}', saved.label).replace('{n}', fmtN(saved.members))
                        : t('perm_saved_desc_none').replace('{name}', saved.label))}
            </CenteredAlert>
        </PermissionViewProvider>
    );
}

/** Edit and delete for a custom role, in the role list row and the tablet header. */
function RoleRowActions({ role, onEdit, onDelete, className }: { role: RoleRow; onEdit: () => void; onDelete: () => void; className?: string }) {
    const t = useT();
    return (
        <div className={cn('flex gap-0.5', className)}>
            <button
                type="button"
                onClick={onEdit}
                title={`${t('edit')} ${role.label}`}
                aria-label={`${t('edit')} ${role.label}`}
                className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md"
            >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
                type="button"
                onClick={onDelete}
                title={`${t('delete')} ${role.label}`}
                aria-label={`${t('delete')} ${role.label}`}
                className="text-destructive hover:bg-destructive/10 flex h-7 w-7 items-center justify-center rounded-md"
            >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    );
}

/** Loading Role Templates: role list, sticky header, then cards with a heading strip, master band and ruled cells. */
function RolesSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]" aria-busy>
            <div className="border-border hidden border-r lg:block">
                <ListSkeleton rows={4} />
            </div>
            <div className="min-w-0 px-5 pb-5">
                <div className="border-border mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-10 w-72 max-w-full" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    {[3, 2].map((cells, i) => (
                        <div key={i} className="border-border @container overflow-clip rounded-lg border">
                            <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3.5 py-3')}>
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-3 w-10" />
                            </div>
                            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-3">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="h-3 w-56 max-w-full" />
                                </div>
                                <Skeleton className="ml-auto h-5 w-9 rounded-full" />
                            </div>
                            <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3">
                                {Array.from({ length: cells }).map((_, j) => (
                                    <div key={j} className="border-border -mt-px -ml-px space-y-3 border-t border-l px-4 pt-3 pb-4">
                                        <Skeleton className="h-6 w-full" />
                                        <Skeleton className="h-3 w-3/4" />
                                        <Skeleton className="h-3 w-2/3" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Renders the diff detail panel for a single audit entry. */
function AuditDetailPanel({ details, lang, lookups }: { details: AuditDetails; lang: Lang; lookups: AuditLookups }) {
    const t = useT();
    const fmt = useDateFormat();
    const { permissionsAdded, permissionsRemoved, membersAdded, membersRemoved } = splitAuditEntries(details);
    const hasPermDiff = permissionsAdded.length > 0 || permissionsRemoved.length > 0;
    const hasRoleChange = details.from !== undefined || details.to !== undefined;
    const changeEntries = Object.entries(details.changes ?? {});

    // Render a diff value (null/'' shown as a muted dash; date values in the date setting).
    const diffValue = (v: unknown) =>
        v === null || v === undefined || v === '' ? (
            <span className="text-muted-foreground">—</span>
        ) : isDateString(v) ? (
            storedDateText(v, fmt)
        ) : (
            String(v)
        );

    return (
        <div className="space-y-3 px-5 py-3">
            {changeEntries.length > 0 && (
                <div className="space-y-1.5">
                    {changeEntries.map(([field, { from, to }]) => {
                        const before = resolveAuditValue(field, from, lookups);
                        const after = resolveAuditValue(field, to, lookups);
                        // Long values stack and wrap in a scroll box; short ones keep the old → new row
                        const long = String(before ?? '').length > 80 || String(after ?? '').length > 80;

                        return (
                            <div key={field} className={cn('gap-2 text-sm', long ? 'space-y-1' : 'flex items-center')}>
                                <span className="text-muted-foreground block w-32 shrink-0 truncate text-xs font-medium">
                                    {auditFieldLabel(field, lang as 'en' | 'th')}
                                </span>
                                {long && <span className="text-muted-foreground block text-[11px]">{t('audit_before')}</span>}
                                <span
                                    className={cn(
                                        'bg-muted text-muted-foreground rounded px-2 py-0.5',
                                        // Long values say "before" instead of being struck through
                                        long ? 'block max-h-32 overflow-auto text-xs break-all whitespace-pre-wrap' : 'line-through',
                                    )}
                                >
                                    {diffValue(before)}
                                </span>
                                {!long && <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />}
                                {long && <span className="text-brand block text-[11px]">{t('audit_after')}</span>}
                                <span
                                    className={cn(
                                        'bg-brand/10 text-brand rounded px-2 py-0.5 font-medium',
                                        long && 'block max-h-32 overflow-auto text-xs break-all whitespace-pre-wrap',
                                    )}
                                >
                                    {diffValue(after)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            {hasRoleChange && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 line-through">{details.from}</span>
                    <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="bg-brand/10 text-brand rounded px-2 py-0.5 font-medium">{details.to}</span>
                </div>
            )}
            {hasPermDiff && (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {permissionsAdded.length > 0 && (
                        <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                                {translate(lang, 'perm_ui_log_added')}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {permissionsAdded.map((key) => {
                                    const [mod, act] = key.split('.');
                                    return (
                                        <span
                                            key={key}
                                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                        >
                                            <span className="opacity-60">{moduleLabel(mod, lang as 'en' | 'th')} /</span>
                                            {actionLabel(mod, act, lang as 'en' | 'th')}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {permissionsRemoved.length > 0 && (
                        <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold tracking-wide text-rose-500 uppercase dark:text-rose-400">
                                {translate(lang, 'perm_ui_log_removed')}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {permissionsRemoved.map((key) => {
                                    const [mod, act] = key.split('.');
                                    return (
                                        <span
                                            key={key}
                                            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                                        >
                                            <span className="opacity-60">{moduleLabel(mod, lang as 'en' | 'th')} /</span>
                                            {actionLabel(mod, act, lang as 'en' | 'th')}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <AuditMemberChanges membersAdded={membersAdded} membersRemoved={membersRemoved} roleChanges={details.role_changes ?? []} />
            {/* Records a bulk action touched */}
            {(details.items ?? []).length > 0 && (
                <div>
                    <div className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">{t('audit_records')}</div>
                    <div className="flex flex-wrap gap-1">
                        {(details.items ?? []).map((item) => (
                            <span key={item} className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {Object.entries(details.facts ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0 truncate text-xs font-medium">{key}</span>
                    <span className="bg-muted rounded px-2 py-0.5 text-xs">{value}</span>
                </div>
            ))}
        </div>
    );
}

const AUDIT_CATEGORIES = ['created', 'updated', 'deleted', 'workflow', 'auth'];

/** Tinted icon-chip classes for the audit feed, keyed by action tone. */
const AUDIT_TONE: Record<string, string> = {
    emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    slate: 'bg-muted text-muted-foreground',
};

/** Map an action string to an icon + tone by its leading verb. */
function auditMeta(action: string): { icon: typeof Plus; tone: string } {
    const a = action.toLowerCase();
    if (/^(created|registered|submitted|opened|uploaded|imported)/.test(a)) return { icon: Plus, tone: 'emerald' };
    if (/^(deleted|removed)/.test(a)) return { icon: Trash2, tone: 'rose' };
    if (/^rejected/.test(a)) return { icon: X, tone: 'rose' };
    if (/^(approved|accepted|received|committed|fulfilled|completed|resolved)/.test(a)) return { icon: Check, tone: 'emerald' };
    if (/^(signed|changed own|updated own)/.test(a)) return { icon: LogIn, tone: 'slate' };
    if (/^stock /.test(a)) return { icon: ArrowLeftRight, tone: 'blue' };
    return { icon: Pencil, tone: 'blue' }; // updated / renewed / set / changed / …
}

/** Up-to-two-letter initials for the actor avatar. */
function auditInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
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

/** One-line diff summary shown under the action in the table. */
function auditDiffSummary(d: AuditDetails | null, fmt: DateFormatter): string | null {
    if (!d) return null;
    // Clipped hard: a value can be a whole email body; the panel shows all of it
    const val = (v: unknown) => {
        if (v === null || v === undefined || v === '') return '—';
        if (isDateString(v)) return storedDateText(v, fmt);
        const s = String(v).replace(/\s+/g, ' ').trim();
        return s.length > 60 ? `${s.slice(0, 60)}…` : s;
    };
    const changes = Object.entries(d.changes ?? {});
    if (changes.length > 0) {
        const [field, { from, to }] = changes[0];
        const head = `${field}: ${val(from)} → ${val(to)}`;
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
    if (facts.length > 0) return facts.map(([key, value]) => `${key}: ${value}`).join('  ');
    return null;
}

function AuditTab() {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmtN = useNumberFormat();
    const [expandedId, setExpandedId] = useState<number | null>(null);
    // Search, filters, page and rows-per-page live in the URL (?search, category, user, page, per).
    const list = useListParams();
    const { page, perPage: pageSize } = list;
    const search = list.get('search');
    const categoryParam = list.get('category');
    const category = AUDIT_CATEGORIES.includes(categoryParam) ? categoryParam : 'all';
    const user = list.get('user') || 'all';
    const sentSearch = useDebouncedSearch(search);
    const filters: AuditFilters = { search: sentSearch, category, user };
    const hasSearchOrFilter = search !== '' || category !== 'all' || user !== 'all';

    const { data, isLoading } = useAuditLogs(page, pageSize, filters);
    // Steady pager height while loading; sticky header while the table fits its width
    const tableBoxRef = useRef<HTMLDivElement>(null);
    const heldTableHeight = useHeldHeight(tableBoxRef, isLoading);
    const tableFitsWidth = useTableFitsWidth(tableBoxRef);

    // Reference data to turn raw foreign-key ids in diffs into entity names.
    const { data: positions = [] } = usePositions();
    const { data: departments = [] } = useDepartments();
    const { data: sections = [] } = useSections();
    const { data: employees = [] } = useEmployeesByIds(auditEmployeeIds(data?.data ?? []));
    const lookups = useMemo<AuditLookups>(
        () => ({
            positions: new Map(positions.map((p) => [p.id, p.title])),
            departments: new Map(departments.map((d) => [d.id, localName(d, lang)])),
            sections: new Map(sections.map((s) => [s.id, localName(s, lang)])),
            employees: new Map(employees.map((e) => [e.id, localName(e, lang)])),
        }),
        [positions, departments, sections, employees, lang],
    );

    const logs = data?.data ?? [];
    const meta = data?.meta;
    const totalPages = meta?.last_page ?? 1;
    usePageInRange(list, meta?.last_page);
    const total = meta?.total ?? 0;
    const users = meta?.users ?? [];
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    // A ?user= naming nobody in the log falls back to all users.
    const unknownUser = meta?.users !== undefined && user !== 'all' && !meta.users.includes(user);
    useEffect(() => {
        if (unknownUser) list.setFilter('user', '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unknownUser]);

    // A filter change returns to page 1 (in the same URL write) and folds any open row.
    const setFilter = (key: 'search' | 'category' | 'user', value: string) => {
        list.setFilter(key, value === 'all' ? '' : value);
        setExpandedId(null);
    };
    const setPage = (update: (current: number) => number) => list.table.paging.onPageChange(update(page));

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
        ...users.map((u) => ({ value: u, label: u, search: u })),
    ];

    // Every shape the detail panel can draw; a shape left out gets no expand control
    const hasDetails = (d: AuditDetails | null): boolean => {
        if (!d) return false;
        return (
            (d.added?.length ?? 0) > 0 ||
            (d.removed?.length ?? 0) > 0 ||
            (d.role_changes?.length ?? 0) > 0 ||
            d.from !== undefined ||
            d.to !== undefined ||
            Object.keys(d.changes ?? {}).length > 0 ||
            (d.items?.length ?? 0) > 0 ||
            Object.keys(d.facts ?? {}).length > 0
        );
    };

    const handlePageSize = (size: number) => {
        list.table.paging.onPageSizeChange(size);
        setExpandedId(null);
    };

    return (
        <div>
            {/* Filter bar */}
            <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-3">
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => setFilter('search', e.target.value)}
                        placeholder={t('perm_audit_search')}
                        aria-label={searchLabel(t('perm_audit_search'))}
                        className="pl-9 text-ellipsis"
                    />
                </div>
                <div className="w-44">
                    <SearchableSelect value={category} onChange={(v) => setFilter('category', v)} options={categoryOptions} />
                </div>
                <div className="w-44">
                    <SearchableSelect value={user} onChange={(v) => setFilter('user', v)} options={userOptions} />
                </div>
            </div>

            <div
                ref={tableBoxRef}
                className={cn(!tableFitsWidth && 'overflow-x-auto')}
                style={heldTableHeight ? { minHeight: heldTableHeight } : undefined}
            >
                <table className="w-full text-sm">
                    <thead className={cn(tableFitsWidth && 'bg-card sticky top-[var(--sticky-top,0px)] z-10 shadow-[0_1px_0_var(--color-border)]')}>
                        <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                            {['Event', t('audit_user'), t('audit_target'), t('audit_time'), ''].map((h, i) => (
                                <th
                                    key={i}
                                    className="text-muted-foreground px-5 py-2.5 text-left text-[11.5px] font-semibold tracking-wide uppercase"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                <td colSpan={5} className="p-5">
                                    <TableSkeleton rows={8} cols={5} />
                                </td>
                            </tr>
                        )}
                        {!isLoading && logs.length === 0 && (
                            <tr>
                                <td colSpan={5}>
                                    <EmptyState
                                        kind={hasSearchOrFilter ? 'search' : 'empty'}
                                        title={t(hasSearchOrFilter ? 'perm_empty_audit_search' : 'perm_empty_audit')}
                                        hint={t(hasSearchOrFilter ? 'perm_empty_audit_search_hint' : 'perm_empty_audit_hint')}
                                    />
                                </td>
                            </tr>
                        )}
                        {!isLoading &&
                            logs.map((l) => {
                                const isExpanded = expandedId === l.id;
                                const showDetails = hasDetails(l.details);
                                const am = auditMeta(l.action);
                                const AIcon = am.icon;
                                const summary = auditDiffSummary(l.details, fmt);
                                return (
                                    <>
                                        <tr
                                            key={l.id}
                                            onClick={() => showDetails && setExpandedId(isExpanded ? null : l.id)}
                                            className={cn(
                                                'border-border/60 border-b transition-colors',
                                                showDetails && 'hover:bg-accent/40 cursor-pointer',
                                                isExpanded && 'bg-accent/30',
                                                !isExpanded && 'last:border-0',
                                            )}
                                        >
                                            <td className="px-5 py-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span
                                                        className={cn(
                                                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                                                            AUDIT_TONE[am.tone],
                                                        )}
                                                    >
                                                        <AIcon className="h-4 w-4" />
                                                    </span>
                                                    {/* Capped width so a long value can't push the other columns off screen */}
                                                    <div className="max-w-[36rem] min-w-0">
                                                        <div className="font-medium">{l.action}</div>
                                                        {summary && <div className="text-muted-foreground truncate text-xs">{summary}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                                                        {auditInitials(l.user_name)}
                                                    </span>
                                                    <span className="truncate text-sm">{l.user_name}</span>
                                                </div>
                                            </td>
                                            <td className="text-muted-foreground px-5 py-3">{l.target ?? '—'}</td>
                                            <td
                                                className="text-muted-foreground px-5 py-3 text-xs whitespace-nowrap"
                                                title={fmt.dateTime(l.created_at)}
                                            >
                                                {auditAgo(l.created_at, lang, fmt.dateTime(l.created_at))}
                                            </td>
                                            <td className="px-5 py-3">
                                                {showDetails && (
                                                    <button
                                                        className={cn(
                                                            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                                                            isExpanded
                                                                ? 'bg-brand/10 text-brand'
                                                                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                                        )}
                                                        aria-label={t('asset_open_detail')}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && l.details && (
                                            <tr key={`${l.id}-detail`} className="border-border/60 bg-accent/20 border-b">
                                                <td colSpan={5} className="py-0">
                                                    <AuditDetailPanel details={l.details} lang={lang} lookups={lookups} />
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* Pagination bar */}
            <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm">
                <div className="flex items-center gap-2">
                    <span>{translate(lang, 'perm_ui_rows_per_page')}</span>
                    <Select value={String(pageSize)} onValueChange={(v) => handlePageSize(Number(v))}>
                        <SelectTrigger className="h-8 w-[72px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZES.map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-3">
                    <span>
                        {fmtN(from)}–{fmtN(to)} {translate(lang, 'perm_ui_of')} {fmtN(total)}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            aria-label={t('page_prev')}
                            className="border-border hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                        >
                            <ChevronLeft aria-hidden className="h-4 w-4" />
                        </button>
                        <span className="text-foreground px-1 font-medium">
                            {fmtN(page)} / {fmtN(totalPages)}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            aria-label={t('page_next')}
                            className="border-border hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                        >
                            <ChevronRight aria-hidden className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
