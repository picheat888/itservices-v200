import { translate, useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageTabs } from '@/shared/components/page-tabs';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ListSkeleton } from '@/shared/components/skeletons';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Briefcase, Check, LayoutDashboard, Loader2, Lock, PencilLine, Plus, Save, Search, Shield, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RoleRow } from '../api/permissionApi';
import { ACCESS_COUNT, AccessPermissionTree } from '../components/access-permission-tree';
import { ASSET_COUNT, AssetPermissionTree } from '../components/asset-permission-tree';
import { AuditLogTab } from '../components/audit-log-tab';
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
import { RoleModal, type RoleModalMode } from '../components/role-modal';
import { RoleRowMenu } from '../components/role-row-menu';
import { STOCK_COUNT, StockPermissionTree } from '../components/stock-permission-tree';
import { TICKET_COUNT, TicketPermissionTree } from '../components/ticket-permission-tree';
import { WORKFLOW_COUNT, WorkflowPermissionTree } from '../components/workflow-permission-tree';
import { usePermissionMatrix, useRoleMutations, useUpdateRolePermissions } from '../hooks/use-permissions';
import { rebaseDraft, specEdges } from '../lib/draft-rebase';
import { countGranted, hiddenHitCount, specKeys, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { isRoleChanged } from '../lib/refusal';

/** The tab slugs, which are also what ?tab= carries — no mapping layer to keep in step. */
const TABS = ['templates', 'groups', 'logs'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
// URL keys of the Logs and Role Groups lists; cleared when the tab changes.
const TAB_LIST_KEYS = ['search', 'category', 'user', 'page', 'per', 'role', 'sort', 'view', 'add'];

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
                {tab !== null && <PageTabs tabs={tabs} active={tab} onChange={changeTab} />}

                {tab === 'templates' && <RolesTab onDirtyChange={setRolesDirty} />}
                {tab === 'groups' && <GroupRolesTab />}
                {tab === 'logs' && <AuditLogTab />}
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
    // The mode stays on close, so the dialog keeps its words through the exit animation
    const [roleModal, setRoleModal] = useState<{ open: boolean; mode: RoleModalMode }>({ open: false, mode: { kind: 'create' } });
    const [query, setQuery] = useState('');
    // Save flow: centred confirm (count frozen at open), ✓ flash, then the saved notice
    const [saveStep, setSaveStep] = useState<'idle' | 'confirm' | 'saving' | 'done'>('idle');
    const [pending, setPending] = useState(0);
    const [saveError, setSaveError] = useState<unknown>(null);
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

    // An unknown or deleted ?role= leaves the URL (replace), so the bare URL means the first role again
    const roleParam = searchParams.get('role');
    const unknownRoleParam = data !== undefined && roleParam !== null && !roles.some((r) => r.value === roleParam);
    useEffect(() => {
        if (!unknownRoleParam) return;
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                params.delete('role');
                return params;
            },
            { replace: true },
        );
    }, [unknownRoleParam, setSearchParams]);

    // Retired keys a role still holds stay out of the draft so the save passes server validation
    const catalogKeys = useMemo(
        () => new Set(Object.entries(data?.catalog ?? {}).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`))),
        [data],
    );
    const heldKeys = (r: RoleRow) => new Set(r.permissions.filter((p) => catalogKeys.has(p)));
    // Master/view rules of every card, for rebasing a draft onto a newer stored set
    const draftEdges = useMemo(() => {
        const catalogGroups = Object.entries(data?.catalog ?? {}).map(([module, actions]) => ({
            module,
            keys: actions.map((a) => `${module}.${a}`),
        }));
        return [...catalogGroups, ...ADMIN_GROUPS].flatMap((group) => specEdges(cardSpec(group).spec));
    }, [data]);

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

    // The stored set the draft stands on and its version (sent with the save)
    const seededFor = useRef<string | null>(null);
    const seedKeys = useRef<Set<string>>(new Set());
    const draftVersion = useRef('');
    /** A newly selected role seeds the draft; a newer version of the same role rebases the unsaved changes onto it. */
    const adoptStored = (stored: RoleRow) => {
        const keys = heldKeys(stored);
        if (seededFor.current !== stored.value) {
            seededFor.current = stored.value;
            seedKeys.current = keys;
            draftVersion.current = stored.version;
            setDraft(keys);
            return;
        }
        if (draftVersion.current === stored.version) return;
        const seed = seedKeys.current;
        seedKeys.current = keys;
        draftVersion.current = stored.version;
        setDraft((prev) => rebaseDraft(prev, seed, keys, draftEdges));
    };
    useEffect(() => {
        if (role) adoptStored(role);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.value, role?.version]);

    // The saved notice follows the ✓ beat; a tab left mid-beat drops it
    const doneTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(doneTimer.current), []);
    const pickerId = useId();
    const roleHeading = useRef<HTMLHeadingElement>(null);

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
    const editRole = (r: RoleRow) => setRoleModal({ open: true, mode: { kind: 'edit', role: r } });
    const duplicateRole = (r: RoleRow) => setRoleModal({ open: true, mode: { kind: 'duplicate', source: r, savedCount: heldKeys(r).size } });
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
            // The draft takes the stored set, so nothing reads as unsaved
            const stored = fresh.roles.find((r) => r.value === role.value);
            if (stored) {
                const keys = heldKeys(stored);
                seedKeys.current = keys;
                draftVersion.current = stored.version;
                setDraft(keys);
            }
        } catch (err: unknown) {
            if (isRoleChanged(err)) {
                // Someone else saved this role: rebase onto the latest, then the reader reviews and saves again
                const { data: latest } = await refetch();
                const stored = latest?.roles.find((r) => r.value === role.value);
                if (stored) adoptStored(stored);
                setSaveStep('idle');
                useToastStore.getState().push(t('perm_refusal_role_changed'), 'warning');
                return;
            }
            setSaveError(err);
            setSaveStep('confirm');
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
        <PermissionViewProvider
            value={{ changed: (key) => changedKeys.has(key), query, hiddenHits: (module) => hiddenHits.get(module) ?? 0, superRole: role.is_super }}
        >
            <div className="border-border flex items-center justify-between border-b p-3">
                <span className="text-muted-foreground text-sm">{translate(lang, 'perm_ui_all_templates')}</span>
                <Button onClick={() => setRoleModal({ open: true, mode: { kind: 'create' } })}>
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
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand-ink')}>{r.label}</span>
                            </button>
                            <RoleRowMenu
                                role={r}
                                onEdit={() => editRole(r)}
                                onDuplicate={() => duplicateRole(r)}
                                onDelete={() => handleDeleteRole(r)}
                                className="pr-2"
                            />
                        </div>
                    ))}
                </div>

                <div className="min-w-0 px-5 pb-5">
                    {/* Role header: sticks while the cards scroll, so Save is always in reach */}
                    <div className="bg-card border-border sticky top-[var(--sticky-top,0px)] z-10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4">
                        <div className="min-w-0">
                            <h2 ref={roleHeading} tabIndex={-1} className="sr-only text-lg font-bold focus:outline-none lg:not-sr-only lg:block">
                                {role.label}
                            </h2>
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
                                <RoleRowMenu
                                    role={role}
                                    onEdit={() => editRole(role)}
                                    onDuplicate={() => duplicateRole(role)}
                                    onDelete={() => handleDeleteRole(role)}
                                />
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
                                        <h2 className="text-foreground text-sm font-bold">{t(section.label)}</h2>
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
                        {sectionViews.length === 0 && (
                            <EmptyState kind="search" title={t('perm_search_none').replace('{q}', query.trim())} hint={t('perm_search_none_hint')} />
                        )}
                    </div>
                </div>
            </div>

            <RoleModal
                open={roleModal.open}
                mode={roleModal.mode}
                onClose={() => setRoleModal((m) => ({ ...m, open: false }))}
                onDuplicated={switchRole}
            />

            <CenteredAlert
                open={saveStep !== 'idle'}
                icon={PencilLine}
                title={t('perm_confirm_title')}
                busy={saveStep === 'saving' || saveStep === 'done'}
                error={saveError}
                returnFocus={() => roleHeading.current}
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
            </CenteredAlert>

            <CenteredAlert
                open={saved !== null}
                icon={ShieldCheck}
                title={t('perm_saved_title')}
                returnFocus={() => roleHeading.current}
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
