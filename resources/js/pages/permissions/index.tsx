import { GroupRoleModal } from '@/components/permissions/group-role-modal';
import { RoleModal } from '@/components/permissions/role-modal';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { CardGridSkeleton, ListSkeleton, TableSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useDateTime } from '@/hooks/use-settings';
import {
    useAuditLogs,
    useGroupRoleMutations,
    useGroupRoles,
    usePermissionMatrix,
    useRoleMutations,
    useSetDefaultGroup,
    useUpdateRolePermissions,
} from '@/hooks/use-permissions';
import { useT } from '@/lib/i18n';
import { actionLabel, isLivePermission, moduleLabel } from '@/lib/permission-labels';
import { cn } from '@/lib/utils';
import type { AuditDetails, AuditFilters, GroupRole, RoleRow } from '@/services/permissionApi';
import { useUiStore } from '@/stores/ui';
import { ArrowLeftRight, Briefcase, Check, ChevronLeft, ChevronRight, Eye, LogIn, Pencil, Plus, Save, Search, Shield, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

type Tab = 'roles' | 'groups' | 'audit';

export default function PermissionsPage() {
    const t = useT();
    const [tab, setTab] = useState<Tab>('roles');

    const tabs: { id: Tab; label: string }[] = [
        { id: 'roles', label: t('perm_roles') },
        { id: 'groups', label: t('perm_groups') },
        { id: 'audit', label: t('perm_audit') },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('permissions')}</h1>
                <p className="text-muted-foreground text-sm">{t('perm_sub')}</p>
            </div>

            <Card className="overflow-hidden p-0">
                <div className="border-border flex gap-1 border-b px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb.label}
                        </button>
                    ))}
                </div>

                {tab === 'roles' && <RolesTab />}
                {tab === 'groups' && <GroupRolesTab />}
                {tab === 'audit' && <AuditTab />}
            </Card>
        </div>
    );
}

// Groups the permission modules under the same sections as the sidebar nav
// (Workspace / Administration) so the matrix mirrors the app's mental model.
// Dashboard (Overview) carries no permissions, so it isn't represented here.
const PERM_SECTIONS: { label: string; icon: React.ComponentType<{ className?: string }>; modules: string[] }[] = [
    { label: 'nav_workspace', icon: Briefcase, modules: ['tickets', 'requests', 'assets', 'contracts', 'stock', 'employees'] },
    { label: 'nav_admin', icon: Shield, modules: ['system'] },
];

// Administration is presented as the design's four cards. Permission / Email /
// Setting reuse the live `system.*` keys (toggleable + persisted); the remaining
// rows are presentational "coming soon" placeholders for features not yet built.
const ADMIN_GROUPS: { module: string; keys: string[] }[] = [
    { module: 'permissions', keys: ['system.manage_permissions', 'system.manage_roles', 'system.manage_groups', 'system.view_audit'] },
    { module: 'email_templates', keys: ['system.configure_notifications', 'email.edit', 'email.enable', 'email.create', 'email.test'] },
    { module: 'settings', keys: ['system.edit_settings', 'settings.branding', 'settings.sla', 'settings.masterdata', 'settings.integrations'] },
    { module: 'reports', keys: ['reports.view', 'reports.run', 'reports.export', 'reports.schedule', 'reports.custom'] },
];

function RolesTab() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading } = usePermissionMatrix();
    const update = useUpdateRolePermissions();
    const roleMut = useRoleMutations();
    const [selected, setSelected] = useState<string | null>(null);
    const [draft, setDraft] = useState<Set<string>>(new Set());
    const [roleModal, setRoleModal] = useState<{ open: boolean; role: RoleRow | null }>({ open: false, role: null });

    const roles = data?.roles ?? [];
    const role: RoleRow | undefined = roles.find((r) => r.value === selected) ?? roles[0];

    useEffect(() => {
        if (role) {
            setSelected(role.value);
            setDraft(new Set(role.permissions));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.value, data]);

    const dirty = useMemo(() => {
        if (!role) return false;
        const orig = new Set(role.permissions);
        if (orig.size !== draft.size) return true;
        for (const p of draft) if (!orig.has(p)) return true;
        return false;
    }, [draft, role]);

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

    // Build the section list from the catalog, dropping empty sections and
    // sweeping any unmapped module into a trailing "Other" section.
    const sections = PERM_SECTIONS.map((s) => ({ label: s.label, icon: s.icon, modules: s.modules.filter((m) => data.catalog[m]) })).filter(
        (s) => s.modules.length > 0,
    );
    const knownModules = new Set(PERM_SECTIONS.flatMap((s) => s.modules));
    const leftover = Object.keys(data.catalog).filter((m) => !knownModules.has(m));
    if (leftover.length > 0) sections.push({ label: 'perm_other', icon: Shield, modules: leftover });

    // A toggle reads "on" only for live permissions the role actually holds
    // (super holds every live permission). Used for the section/module counts.
    const isOn = (key: string) => isLivePermission(key) && (role.is_super || draft.has(key));

    return (
        <>
            <div className="border-border flex items-center justify-between border-b p-3">
                <span className="text-muted-foreground text-sm">
                    {lang === 'th' ? 'Role Templates ทั้งหมดในระบบ' : 'All Role Templates in the System'}
                </span>
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
                            onClick={() => setSelected(r.value)}
                            className={cn(
                                'group border-border hover:bg-accent/50 flex cursor-pointer items-center justify-between border-b px-4 py-3.5 transition-colors',
                                r.value === role.value && 'bg-brand/10',
                            )}
                        >
                            <div className="flex flex-1 items-center gap-2 text-left">
                                <span className="h-6 w-1.5 shrink-0 rounded" style={{ background: r.color }} />
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand')}>{r.label}</span>
                            </div>
                            {!r.is_system && (
                                <div className="pointer-events-none flex gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRoleModal({ open: true, role: r });
                                        }}
                                        className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const result = await Swal.fire({
                                                title: t('confirm_delete'),
                                                text: r.label,
                                                icon: 'warning',
                                                showCancelButton: true,
                                                confirmButtonText: t('delete'),
                                                cancelButtonText: t('cancel'),
                                                confirmButtonColor: '#ef4444',
                                                cancelButtonColor: '#6b7280',
                                                customClass: {
                                                    popup: '!rounded-xl !shadow-xl',
                                                    confirmButton: '!rounded-lg !font-medium',
                                                    cancelButton: '!rounded-lg !font-medium',
                                                },
                                                reverseButtons: true,
                                            });
                                            if (result.isConfirmed) roleMut.remove.mutate(r.value);
                                        }}
                                        className="text-destructive hover:bg-destructive/10 flex h-7 w-7 items-center justify-center rounded-md"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-bold">{role.label}</div>
                            <div className="text-muted-foreground text-xs">
                                {role.is_super ? t('perm_super_locked') : `${draft.size} ${t('perm_enabled')}`}
                            </div>
                        </div>
                        {!role.is_super && (
                            <Button
                                disabled={!dirty || update.isPending}
                                onClick={async () => {
                                    const result = await Swal.fire({
                                        title: t('perm_save'),
                                        text: role.label,
                                        icon: 'question',
                                        showCancelButton: true,
                                        confirmButtonText: t('save'),
                                        cancelButtonText: t('cancel'),
                                        confirmButtonColor: '#2563eb',
                                        cancelButtonColor: '#6b7280',
                                        customClass: {
                                            popup: '!rounded-xl !shadow-xl',
                                            confirmButton: '!rounded-lg !font-medium',
                                            cancelButton: '!rounded-lg !font-medium',
                                        },
                                        reverseButtons: true,
                                    });
                                    if (result.isConfirmed) {
                                        update.mutate({ role: role.value, permissions: [...draft] });
                                    }
                                }}
                            >
                                <Save className="h-4 w-4" />
                                {t('perm_save')}
                            </Button>
                        )}
                    </div>

                    <div className="space-y-6">
                        {sections.map((section) => {
                            const SectionIcon = section.icon;
                            // Workspace cards come from the backend catalog; Administration is
                            // presented as the design's fixed four-card split.
                            const groups =
                                section.label === 'nav_admin'
                                    ? ADMIN_GROUPS
                                    : section.modules.map((m) => ({ module: m, keys: data.catalog[m].map((a) => `${m}.${a}`) }));
                            const sectionActions = groups.flatMap((g) => g.keys);
                            const sectionOn = sectionActions.filter(isOn).length;
                            return (
                                <div key={section.label}>
                                    <div className="border-border mb-3 flex items-center gap-2 border-b pb-1.5">
                                        <SectionIcon className="text-muted-foreground h-4 w-4" />
                                        <span className="text-foreground text-sm font-bold">{t(section.label)}</span>
                                        <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                                            {sectionOn} / {sectionActions.length}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        {groups.map((group) => {
                                            const moduleOn = group.keys.filter(isOn).length;
                                            return (
                                                <div key={group.module} className="border-border rounded-lg border p-3.5">
                                                    <div className="mb-2.5 flex items-center justify-between gap-2">
                                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                                            {moduleLabel(group.module, lang)}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'font-mono text-[10.5px] font-bold',
                                                                moduleOn === 0 ? 'text-muted-foreground' : 'text-brand',
                                                            )}
                                                        >
                                                            {moduleOn}/{group.keys.length}
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {group.keys.map((key) => {
                                                            const [mod, action] = key.split('.');
                                                            const live = isLivePermission(key);
                                                            // Coming-soon permissions are shown off and locked — the
                                                            // feature isn't built yet, so the switch can't be turned on.
                                                            const on = live && (role.is_super || draft.has(key));
                                                            const locked = role.is_super || !live;
                                                            return (
                                                                <div key={key} className="flex items-center justify-between gap-2">
                                                                    <span className={cn('text-sm', on ? 'text-foreground' : 'text-muted-foreground')}>
                                                                        {actionLabel(mod, action, lang)}
                                                                        {!live && (
                                                                            <span className="ml-1 text-[11px] italic opacity-70">
                                                                                ({t('coming_soon_tag')})
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (!locked) toggle(key);
                                                                        }}
                                                                        disabled={locked}
                                                                        className={cn(
                                                                            'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60',
                                                                            on ? 'bg-brand' : 'bg-muted',
                                                                        )}
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                                                                                on ? 'left-[1.125rem]' : 'left-0.5',
                                                                            )}
                                                                        >
                                                                            {on && <Check className="text-brand h-2.5 w-2.5" />}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <RoleModal open={roleModal.open} onClose={() => setRoleModal({ open: false, role: null })} role={roleModal.role} />
        </>
    );
}

function GroupRolesTab() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const isSuper = user?.role === 'super';
    const { data, isLoading } = useGroupRoles();
    const { remove } = useGroupRoleMutations();
    const setDefaultGroup = useSetDefaultGroup();
    const [modal, setModal] = useState<{ open: boolean; group: GroupRole | null }>({ open: false, group: null });
    const [defaultDialog, setDefaultDialog] = useState(false);
    const [pendingDefault, setPendingDefault] = useState<number | null>(null);

    const groups = data?.data ?? [];
    const defaultGroupId = data?.default_group_id ?? null;

    const defaultGroup = groups.find((g) => g.id === defaultGroupId);

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
                            <span className="text-muted-foreground">{lang === 'th' ? '(ยังไม่ได้ตั้งค่า)' : '(not set)'}</span>
                        )}
                    </button>
                </div>
                <Button onClick={() => setModal({ open: true, group: null })}>
                    <Plus className="h-4 w-4" />
                    {t('gr_add')}
                </Button>
            </div>

            {groups.length === 0 && (
                <div className="border-border text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">{t('gr_empty')}</div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {groups.map((g) => {
                    const isDefault = g.id === defaultGroupId;
                    // Only a super admin may edit or delete the Administrator role group.
                    const adminLocked = g.role === 'super' && !isSuper;
                    return (
                        <Card key={g.id} className={cn('p-4', isDefault && 'ring-brand/40 ring-2')}>
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-semibold">{g.name}</span>
                                        {isDefault && (
                                            <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <button
                                        onClick={() => setModal({ open: true, group: g })}
                                        disabled={adminLocked}
                                        title={adminLocked ? t('gr_admin_protected') : undefined}
                                        className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const result = await Swal.fire({
                                                title: t('confirm_delete'),
                                                text: g.name,
                                                icon: 'warning',
                                                showCancelButton: true,
                                                confirmButtonText: t('delete'),
                                                cancelButtonText: t('cancel'),
                                                confirmButtonColor: '#ef4444',
                                                cancelButtonColor: '#6b7280',
                                                customClass: {
                                                    popup: '!rounded-xl !shadow-xl',
                                                    confirmButton: '!rounded-lg !font-medium',
                                                    cancelButton: '!rounded-lg !font-medium',
                                                },
                                                reverseButtons: true,
                                            });
                                            if (result.isConfirmed) remove.mutate(g.id);
                                        }}
                                        disabled={adminLocked}
                                        title={adminLocked ? t('gr_admin_protected') : undefined}
                                        className="text-destructive hover:bg-destructive/10 flex h-7 w-7 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {g.role_label && (
                                <span className="bg-brand/10 text-brand mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium">
                                    {g.role_label}
                                </span>
                            )}
                            <div className="border-border text-muted-foreground mt-3 flex items-center justify-between border-t pt-3 text-sm">
                                <span className="text-foreground flex items-center gap-1.5 font-mono font-semibold">
                                    <Users className="h-3.5 w-3.5" /> {g.member_count}
                                </span>
                                <span>{lang === 'th' ? 'สมาชิก' : 'Members'}</span>
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
                                    <span className="text-muted-foreground">{lang === 'th' ? '(ยังไม่ได้ตั้งค่า)' : '(none)'}</span>
                                </SelectItem>
                                {groups.map((g) => (
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

                                const result = await Swal.fire({
                                    title: t('perm_default_group'),
                                    html: groupToSet
                                        ? `<span style="font-size:0.9rem"><strong>${groupName}</strong></span>`
                                        : `<span style="font-size:0.9rem">${lang === 'th' ? 'ยกเลิกการตั้งค่า' : 'Clear default group'}</span>`,
                                    icon: 'question',
                                    showCancelButton: true,
                                    confirmButtonText: t('save'),
                                    cancelButtonText: t('cancel'),
                                    confirmButtonColor: '#2563eb',
                                    cancelButtonColor: '#6b7280',
                                    customClass: {
                                        popup: '!rounded-xl !shadow-xl',
                                        confirmButton: '!rounded-lg !font-medium',
                                        cancelButton: '!rounded-lg !font-medium',
                                    },
                                    reverseButtons: true,
                                });

                                if (result.isConfirmed) {
                                    setDefaultGroup.mutate(groupToSet);
                                } else {
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
function AuditDetailPanel({ details, lang }: { details: AuditDetails; lang: string }) {
    const hasPermDiff = (details.added?.length ?? 0) > 0 || (details.removed?.length ?? 0) > 0;
    const hasRoleChange = details.from !== undefined || details.to !== undefined;
    const changeEntries = Object.entries(details.changes ?? {});

    // Render a diff value (null/'' shown as a muted dash).
    const diffValue = (v: unknown) =>
        v === null || v === undefined || v === '' ? <span className="text-muted-foreground">—</span> : String(v);

    return (
        <div className="space-y-3 px-5 py-3">
            {changeEntries.length > 0 && (
                <div className="space-y-1.5">
                    {changeEntries.map(([field, { from, to }]) => (
                        <div key={field} className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-32 shrink-0 truncate font-mono text-xs">{field}</span>
                            <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 line-through">{diffValue(from)}</span>
                            <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                            <span className="bg-brand/10 text-brand rounded px-2 py-0.5 font-medium">{diffValue(to)}</span>
                        </div>
                    ))}
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
                    {(details.added ?? []).length > 0 && (
                        <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold tracking-wide text-emerald-600 uppercase">
                                {lang === 'th' ? 'เพิ่มสิทธิ์' : 'Added'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(details.added ?? []).map((key) => {
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
                    {(details.removed ?? []).length > 0 && (
                        <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold tracking-wide text-rose-500 uppercase">
                                {lang === 'th' ? 'ถอดสิทธิ์' : 'Removed'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(details.removed ?? []).map((key) => {
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
        </div>
    );
}

const PAGE_SIZES = [20, 50, 100] as const;

/** Tinted icon-chip classes for the audit feed, keyed by action tone. */
const AUDIT_TONE: Record<string, string> = {
    emerald: 'bg-emerald-500/12 text-emerald-600',
    blue: 'bg-blue-500/12 text-blue-600',
    rose: 'bg-rose-500/12 text-rose-600',
    slate: 'bg-muted text-muted-foreground',
};

/** Map an action string to an icon + tone by its leading verb. */
function auditMeta(action: string): { icon: typeof Plus; tone: string } {
    const a = action.toLowerCase();
    if (/^(created|registered|submitted|opened|uploaded|imported)/.test(a)) return { icon: Plus, tone: 'emerald' };
    if (/^(deleted|removed)/.test(a)) return { icon: Trash2, tone: 'rose' };
    if (/^rejected/.test(a)) return { icon: X, tone: 'rose' };
    if (/^(approved|accepted|received|committed|fulfilled|resolved)/.test(a)) return { icon: Check, tone: 'emerald' };
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

/** Compact "time ago" label; the full timestamp lives in the title attribute. */
function auditAgo(iso: string, lang: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
    if (m < 60) return lang === 'th' ? `${m} น.` : `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return lang === 'th' ? `${h} ชม.` : `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return lang === 'th' ? `${d} วัน` : `${d}d`;
    return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB');
}

/** One-line diff summary shown under the action in the table. */
function auditDiffSummary(d: AuditDetails | null): string | null {
    if (!d) return null;
    const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
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
    return null;
}

function AuditTab() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { format: fmtDateTime } = useDateTime();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<10 | 20 | 50 | 100>(20);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('all');
    const [user, setUser] = useState('all');
    const filters: AuditFilters = { q, category, user };

    const { data, isLoading } = useAuditLogs(page, pageSize, filters);
    const logs = data?.data ?? [];
    const meta = data?.meta;
    const totalPages = meta?.last_page ?? 1;
    const total = meta?.total ?? 0;
    const users = meta?.users ?? [];
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    // Reset to the first page whenever a filter changes.
    useEffect(() => {
        setPage(1);
        setExpandedId(null);
    }, [q, category, user]);

    const categoryOptions = [
        { value: 'all', label: lang === 'th' ? 'ทุกประเภท' : 'All actions' },
        { value: 'created', label: lang === 'th' ? 'สร้าง' : 'Created' },
        { value: 'updated', label: lang === 'th' ? 'แก้ไข' : 'Updated' },
        { value: 'deleted', label: lang === 'th' ? 'ลบ' : 'Deleted' },
        { value: 'workflow', label: lang === 'th' ? 'อนุมัติ / สต็อก' : 'Workflow' },
        { value: 'auth', label: lang === 'th' ? 'เข้าระบบ' : 'Auth' },
    ].map((o) => ({ ...o, search: o.label }));
    const userOptions = [
        { value: 'all', label: lang === 'th' ? 'ทุกคน' : 'All users', search: '' },
        ...users.map((u) => ({ value: u, label: u, search: u })),
    ];

    const hasDetails = (d: AuditDetails | null): boolean => {
        if (!d) return false;
        return (
            (d.added?.length ?? 0) > 0 ||
            (d.removed?.length ?? 0) > 0 ||
            d.from !== undefined ||
            d.to !== undefined ||
            Object.keys(d.changes ?? {}).length > 0
        );
    };

    const handlePageSize = (size: 10 | 20 | 50 | 100) => {
        setPageSize(size);
        setPage(1);
        setExpandedId(null);
    };

    return (
        <div>
            {/* Filter bar */}
            <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-3">
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_placeholder')} className="pl-9" />
                </div>
                <div className="w-44">
                    <SearchableSelect value={category} onChange={setCategory} options={categoryOptions} />
                </div>
                <div className="w-44">
                    <SearchableSelect value={user} onChange={setUser} options={userOptions} />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-border border-b">
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
                                <td colSpan={5} className="text-muted-foreground px-5 py-10 text-center">
                                    {t('audit_empty')}
                                </td>
                            </tr>
                        )}
                        {!isLoading &&
                            logs.map((l) => {
                                const isExpanded = expandedId === l.id;
                                const showDetails = hasDetails(l.details);
                                const am = auditMeta(l.action);
                                const AIcon = am.icon;
                                const summary = auditDiffSummary(l.details);
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
                                                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', AUDIT_TONE[am.tone])}>
                                                        <AIcon className="h-4 w-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="font-medium">{l.action}</div>
                                                        {summary && <div className="text-muted-foreground truncate font-mono text-xs">{summary}</div>}
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
                                            <td className="text-muted-foreground px-5 py-3 font-mono text-xs whitespace-nowrap" title={fmtDateTime(l.created_at)}>
                                                {auditAgo(l.created_at, lang)}
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
                                                        aria-label="View details"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && l.details && (
                                            <tr key={`${l.id}-detail`} className="border-border/60 bg-accent/20 border-b">
                                                <td colSpan={5} className="py-0">
                                                    <AuditDetailPanel details={l.details} lang={lang} />
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
                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                    <Select value={String(pageSize)} onValueChange={(v) => handlePageSize(Number(v) as 10 | 20 | 50 | 100)}>
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
                        {from}–{to} {lang === 'th' ? 'จาก' : 'of'} {total}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-foreground px-1 font-medium">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
