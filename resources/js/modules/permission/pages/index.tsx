import { translate, useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useDepartments, useEmployeesByIds, usePositions, useSections } from '@/modules/employee';
import { PAGE_SIZES } from '@/shared/components/data-table';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { CardGridSkeleton, ListSkeleton, TableSkeleton } from '@/shared/components/skeletons';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useHeldHeight } from '@/shared/hooks/use-held-height';
import { useListParams, usePageInRange } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { useTableFitsWidth } from '@/shared/hooks/use-table-fits-width';
import { isDateString, storedDateText, type DateFormatter } from '@/shared/lib/datetime';
import { localName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { searchLabel } from '@/shared/lib/search-words';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { SUPER_ROLE, type Lang } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
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
    Users,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuditDetails, AuditFilters, GroupRole, RoleRow } from '../api/permissionApi';
import { AccessPermissionTree } from '../components/access-permission-tree';
import { AssetPermissionTree } from '../components/asset-permission-tree';
import { AuditMemberChanges } from '../components/audit-member-changes';
import { CenteredAlert } from '../components/centered-alert';
import { ContractPermissionTree } from '../components/contract-permission-tree';
import { EmployeePermissionTree } from '../components/employee-permission-tree';
import { GroupRoleModal } from '../components/group-role-modal';
import { ModulePermissionCard, type ModuleMaster } from '../components/module-permission-card';
import { NotificationPermissionTree } from '../components/notification-permission-tree';
import { CHANGED_TEXT, PermissionCard, PermissionCell, PermissionViewProvider, PlainRow, spreadRows } from '../components/permission-layout';
import { ProfilePermissionTree } from '../components/profile-permission-tree';
import { ReportPermissionTree } from '../components/report-permission-tree';
import { RequestPermissionTree } from '../components/request-permission-tree';
import { RoleModal } from '../components/role-modal';
import { StockPermissionTree } from '../components/stock-permission-tree';
import { TicketPermissionTree } from '../components/ticket-permission-tree';
import { WorkflowPermissionTree } from '../components/workflow-permission-tree';
import {
    useAuditLogs,
    useGroupRoleMutations,
    useGroupRoles,
    usePermissionMatrix,
    useRoleMutations,
    useSetDefaultGroup,
    useUpdateRolePermissions,
} from '../hooks/use-permissions';
import { auditEmployeeIds } from '../lib/audit-employee-ids';
import { auditFieldLabel, resolveAuditValue, type AuditLookups } from '../lib/audit-format';
import { splitAuditEntries } from '../lib/audit-members';
import { actionDescription, actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { permissionRefusalText } from '../lib/refusal';

/** The tab slugs, which are also what ?tab= carries — no mapping layer to keep in step. */
const TABS = ['templates', 'groups', 'logs'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
// URL keys of the Logs list; cleared when the tab changes.
const AUDIT_LIST_KEYS = ['search', 'category', 'user', 'page'];

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
    // The Logs list keys go with the tab; rows-per-page stays.
    // Unsaved role-permission draft; leaving the matrix tab asks first.
    const [rolesDirty, setRolesDirty] = useState(false);
    const guardTabSwitch = useDiscardGuard(tab === 'templates' && rolesDirty);
    const changeTab = (next: Tab) => {
        if (next === tab) return;
        guardTabSwitch(() => setTab(next, { extra: (params) => AUDIT_LIST_KEYS.forEach((key) => params.delete(key)) }));
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

function RolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { data, isLoading, isError } = usePermissionMatrix();
    const update = useUpdateRolePermissions();
    const roleMut = useRoleMutations();
    const [selected, setSelected] = useState<string | null>(null);
    const [draft, setDraft] = useState<Set<string>>(new Set());
    const [roleModal, setRoleModal] = useState<{ open: boolean; role: RoleRow | null }>({ open: false, role: null });
    const [query, setQuery] = useState('');
    // Save flow: centred confirm (count frozen at open), ✓ flash, then the saved notice
    const [saveStep, setSaveStep] = useState<'idle' | 'confirm' | 'saving' | 'done'>('idle');
    const [pending, setPending] = useState(0);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saved, setSaved] = useState<{ label: string; members: number } | null>(null);

    const roles = data?.roles ?? [];
    const role: RoleRow | undefined = roles.find((r) => r.value === selected) ?? roles[0];

    // Retired keys a role still holds stay out of the draft so the save passes server validation
    const catalogKeys = useMemo(
        () => new Set(Object.entries(data?.catalog ?? {}).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`))),
        [data],
    );

    useEffect(() => {
        if (role) {
            setSelected(role.value);
            setDraft(new Set(role.permissions.filter((p) => catalogKeys.has(p))));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.value, data]);

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
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    // A refused or failed load says so
    if (isError) return <div className="text-muted-foreground p-10 text-center text-sm">{t('perm_load_failed')}</div>;

    if (isLoading || !data || !role)
        return (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                <div className="border-border border-b p-2 lg:border-r lg:border-b-0">
                    <ListSkeleton rows={4} />
                </div>
                <div className="space-y-3 p-5">
                    <TableSkeleton rows={6} cols={3} />
                    <TableSkeleton rows={4} cols={3} />
                </div>
            </div>
        );

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

    // "On" = a live permission the role holds (super holds all); feeds the counts
    const isOn = (key: string) => isLivePermission(key) && (role.is_super || draft.has(key));

    const keyLabel = (key: string) => {
        const [mod, action] = key.split('.');
        return actionLabel(mod, action, lang);
    };
    const q = query.trim().toLowerCase();
    const matches = (module: string, keys: string[]) =>
        !q || moduleLabel(module, lang).toLowerCase().includes(q) || keys.some((k) => keyLabel(k).toLowerCase().includes(q));
    const searchPlaceholder = t('perm_search_ph');

    const sectionViews = sections
        .map((section) => {
            // Workspace cards come from the backend catalog; Administration is the fixed card split.
            const groups =
                section.label === 'nav_admin'
                    ? ADMIN_GROUPS
                    : section.modules.map((m) => ({ module: m, keys: data.catalog[m].map((a) => `${m}.${a}`) }));
            return { section, groups, shown: groups.filter((g) => matches(g.module, g.keys)) };
        })
        .filter((s) => s.shown.length > 0);

    const openSave = () => {
        setPending(changedKeys.size);
        setSaveError(null);
        setSaveStep('confirm');
    };
    const runSave = async () => {
        setSaveError(null);
        setSaveStep('saving');
        try {
            await update.mutateAsync({ role: role.value, permissions: [...draft] });
        } catch (err: unknown) {
            setSaveError(permissionRefusalText(err, t));
            setSaveStep('confirm');
            return;
        }
        // Same beat as the shared confirm's success check, then the saved notice
        setSaveStep('done');
        const savedRole = { label: role.label, members: role.members };
        setTimeout(() => {
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
        return (
            <PermissionCard
                key={group.module}
                module={group.module}
                on={group.keys.filter(isOn).length}
                total={group.keys.length}
                keys={group.keys}
                lang={lang}
            >
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
                                    on={live && (role.is_super || draft.has(key))}
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
        <PermissionViewProvider value={{ changed: (key) => changedKeys.has(key), query }}>
            <div className="border-border flex items-center justify-between border-b p-3">
                <span className="text-muted-foreground text-sm">{translate(lang, 'perm_ui_all_templates')}</span>
                <Button onClick={() => setRoleModal({ open: true, role: null })}>
                    <Plus className="h-4 w-4" />
                    {t('perm_new_role')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                <div className="border-border border-b lg:border-r lg:border-b-0">
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
                                onClick={() => r.value !== role.value && guardRoleSwitch(() => setSelected(r.value))}
                                className="flex min-w-0 flex-1 items-center gap-2 py-3.5 pl-4 text-left"
                            >
                                <span className="h-6 w-1.5 shrink-0 rounded" style={{ background: r.color }} />
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand')}>{r.label}</span>
                            </button>
                            {!r.is_system && (
                                <div className="pointer-events-none flex gap-0.5 pr-4 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100">
                                    <button
                                        type="button"
                                        onClick={() => setRoleModal({ open: true, role: r })}
                                        title={`${t('edit')} ${r.label}`}
                                        aria-label={`${t('edit')} ${r.label}`}
                                        className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md"
                                    >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteRole(r)}
                                        title={`${t('delete')} ${r.label}`}
                                        aria-label={`${t('delete')} ${r.label}`}
                                        className="text-destructive hover:bg-destructive/10 flex h-7 w-7 items-center justify-center rounded-md"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="min-w-0 px-5 pb-5">
                    {/* Role header: sticks while the cards scroll, so Save is always in reach */}
                    <div className="bg-card border-border sticky top-[var(--sticky-top,0px)] z-10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4">
                        <div className="min-w-0">
                            <div className="text-lg font-bold">{role.label}</div>
                            <div className="text-muted-foreground text-xs">
                                {role.is_super ? t('perm_super_locked') : `${fmtN(draft.size)} ${t('perm_enabled')}`}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <Input
                                type="search"
                                name="perm-search"
                                autoComplete="off"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                aria-label={searchLabel(searchPlaceholder)}
                                className="w-72 max-w-full text-ellipsis"
                            />
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
                            const sectionActions = groups.flatMap((g) => g.keys);
                            const sectionOn = sectionActions.filter(isOn).length;
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
                                            {fmtN(sectionOn)} / {fmtN(sectionActions.length)}
                                        </span>
                                    </div>
                                    {/* Full-width cards; each lays its switches in ruled cells */}
                                    <div className="space-y-4">{shown.map(renderCard)}</div>
                                </div>
                            );
                        })}
                        {sectionViews.length === 0 && (
                            <p className="text-muted-foreground py-6 text-center text-sm">{t('perm_search_none').replace('{q}', query.trim())}</p>
                        )}
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

function GroupRolesTab() {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { isSuper } = useAuth();
    const { data, isLoading } = useGroupRoles();
    const { remove } = useGroupRoleMutations();
    const setDefaultGroup = useSetDefaultGroup();
    const [modal, setModal] = useState<{ open: boolean; group: GroupRole | null }>({ open: false, group: null });
    const [defaultDialog, setDefaultDialog] = useState(false);
    const [pendingDefault, setPendingDefault] = useState<number | null>(null);

    const groups = data?.data ?? [];
    const defaultGroupId = data?.default_group_id ?? null;

    const defaultGroup = groups.find((g) => g.id === defaultGroupId);
    // Super admin groups are never offered as the default; the current one stays visible
    const defaultChoices = groups.filter((g) => g.role !== SUPER_ROLE || g.id === defaultGroupId);

    if (isLoading)
        return (
            <div className="p-5">
                <CardGridSkeleton count={4} cols={4} />
            </div>
        );

    return (
        <div className="space-y-4 p-5">
            {/* Default Role Group selector */}
            <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                <div className="space-y-1">
                    <div className="text-muted-foreground text-xs font-medium">{t('perm_default_group')}</div>
                    <button
                        onClick={() => {
                            setPendingDefault(defaultGroupId);
                            setDefaultDialog(true);
                        }}
                        className="border-border bg-background hover:bg-accent flex h-9 w-64 items-center gap-2 rounded-md border px-3 text-sm transition-colors"
                    >
                        {defaultGroup ? (
                            <>
                                <Users className="text-brand h-4 w-4 shrink-0" />
                                <span className="text-brand truncate font-medium">{defaultGroup.name}</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">{translate(lang, 'perm_ui_not_set')}</span>
                        )}
                    </button>
                </div>
                <Button onClick={() => setModal({ open: true, group: null })}>
                    <Plus className="h-4 w-4" />
                    {t('gr_add')}
                </Button>
            </div>

            {groups.length === 0 && (
                <div className="border-border rounded-lg border border-dashed">
                    <EmptyState title={t('perm_empty_groups')} hint={t('perm_empty_groups_hint').replace('{button}', t('gr_add'))} />
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {groups.map((g) => {
                    const isDefault = g.id === defaultGroupId;
                    // Only a super admin may edit or delete the Administrator role group.
                    const adminLocked = g.role === SUPER_ROLE && !isSuper;
                    return (
                        <Card key={g.id} className={cn('p-4', isDefault && 'ring-brand/40 ring-2')}>
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-semibold">{g.name}</span>
                                        {isDefault && (
                                            <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                                {t('gr_default_badge')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <DisabledReason reason={adminLocked ? t('gr_admin_protected') : null} label={t('edit')}>
                                        <button
                                            onClick={() => setModal({ open: true, group: g })}
                                            disabled={adminLocked}
                                            aria-label={t('edit')}
                                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </DisabledReason>
                                    <DisabledReason reason={adminLocked ? t('gr_admin_protected') : null} label={t('delete')}>
                                        <button
                                            onClick={async () => {
                                                await confirm({
                                                    variant: 'danger',
                                                    entity: { name: g.name },
                                                    action: () => remove.mutateAsync(g.id),
                                                    errorMessage: (err) => permissionRefusalText(err, t),
                                                });
                                            }}
                                            disabled={adminLocked}
                                            aria-label={t('delete')}
                                            className="text-destructive hover:bg-destructive/10 flex h-7 w-7 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </DisabledReason>
                                </div>
                            </div>
                            {g.role_label && (
                                <span className="bg-brand/10 text-brand mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium">
                                    {g.role_label}
                                </span>
                            )}
                            <div className="border-border text-muted-foreground mt-3 flex items-center justify-between border-t pt-3 text-sm">
                                <span className="text-foreground flex items-center gap-1.5 font-semibold">
                                    <Users className="h-3.5 w-3.5" /> {fmtN(g.member_count)}
                                </span>
                                <span>{translate(lang, 'perm_ui_members')}</span>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <GroupRoleModal open={modal.open} onClose={() => setModal({ open: false, group: null })} group={modal.group} />

            {/* Default group dialog */}
            <Dialog open={defaultDialog} onOpenChange={setDefaultDialog}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t('perm_default_group')}</DialogTitle>
                        <DialogDescription>{t('perm_default_group_desc')}</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Select
                            value={pendingDefault !== null ? String(pendingDefault) : '__none__'}
                            onValueChange={(v) => setPendingDefault(v === '__none__' ? null : Number(v))}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">
                                    <span className="text-muted-foreground">{translate(lang, 'perm_ui_none_set')}</span>
                                </SelectItem>
                                {defaultChoices.map((g) => (
                                    <SelectItem key={g.id} value={String(g.id)}>
                                        {g.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDefaultDialog(false)}>
                            {t('cancel')}
                        </Button>
                        <Button
                            disabled={setDefaultGroup.isPending}
                            onClick={async () => {
                                const groupToSet = pendingDefault;
                                const groupName = groups.find((g) => g.id === groupToSet)?.name;

                                setDefaultDialog(false);

                                const ok = await confirm({
                                    variant: 'edit',
                                    title: t('perm_default_group'),
                                    entity: groupToSet ? { name: groupName } : { name: translate(lang, 'perm_ui_clear_default') },
                                    action: () => setDefaultGroup.mutateAsync(groupToSet),
                                    errorMessage: (err) => permissionRefusalText(err, t),
                                });

                                if (!ok) {
                                    setPendingDefault(groupToSet);
                                    setDefaultDialog(true);
                                }
                            }}
                        >
                            {t('save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
