import { GroupRoleModal } from '@/components/permissions/group-role-modal';
import { RoleModal } from '@/components/permissions/role-modal';
import { CardGridSkeleton, ListSkeleton, TableSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
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
import type { AuditDetails, GroupRole, RoleRow } from '@/services/permissionApi';
import { useUiStore } from '@/stores/ui';
import { Check, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
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
                <p className="text-sm text-muted-foreground">{t('perm_sub')}</p>
            </div>

            <Card className="overflow-hidden p-0">
                <div className="flex gap-1 border-b border-border px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
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
const PERM_SECTIONS: { label: string; modules: string[] }[] = [
    { label: 'nav_workspace', modules: ['employees', 'tickets', 'requests', 'assets', 'contracts'] },
    { label: 'nav_admin', modules: ['system'] },
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

    if (isLoading || !data || !role) return (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
            <div className="border-b border-border p-2 lg:border-b-0 lg:border-r"><ListSkeleton rows={4} /></div>
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
    const sections = PERM_SECTIONS
        .map((s) => ({ label: s.label, modules: s.modules.filter((m) => data.catalog[m]) }))
        .filter((s) => s.modules.length > 0);
    const knownModules = new Set(PERM_SECTIONS.flatMap((s) => s.modules));
    const leftover = Object.keys(data.catalog).filter((m) => !knownModules.has(m));
    if (leftover.length > 0) sections.push({ label: 'perm_other', modules: leftover });

    return (
        <>
            <div className="flex items-center justify-between border-b border-border p-3">
                <span className="text-sm text-muted-foreground">
                    {lang === 'th' ? 'Role Templates ทั้งหมดในระบบ' : 'All Role Templates in the System'}
                </span>
                <Button onClick={() => setRoleModal({ open: true, role: null })}>
                    <Plus className="h-4 w-4" />
                    {t('perm_new_role')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                <div className="border-b border-border lg:border-b-0 lg:border-r">
                    {roles.map((r) => (
                        <div
                            key={r.value}
                            className={cn(
                                'group flex items-center justify-between border-b border-border px-4 py-3.5 transition-colors hover:bg-accent/50',
                                r.value === role.value && 'bg-brand/10',
                            )}
                        >
                            <button onClick={() => setSelected(r.value)} className="flex flex-1 items-center gap-2 text-left">
                                <span className="h-6 w-1.5 shrink-0 rounded" style={{ background: r.color }} />
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand')}>{r.label}</span>
                            </button>
                            {!r.is_system && (
                                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        onClick={() => setRoleModal({ open: true, role: r })}
                                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        onClick={async () => {
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
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
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
                            <div className="text-xs text-muted-foreground">
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
                        {sections.map((section) => (
                            <div key={section.label}>
                                <div className="mb-3 border-b border-border pb-1.5 text-sm font-bold text-foreground">
                                    {t(section.label)}
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {section.modules.map((module) => (
                                        <div key={module} className="rounded-lg border border-border p-3.5">
                                            <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{moduleLabel(module, lang)}</div>
                                            <div className="space-y-2">
                                                {data.catalog[module].map((action) => {
                                                    const key = `${module}.${action}`;
                                                    const live = isLivePermission(key);
                                                    // Coming-soon permissions are shown off and locked — the
                                                    // feature isn't built yet, so the switch can't be turned on.
                                                    const on = live && (role.is_super || draft.has(key));
                                                    const locked = role.is_super || !live;
                                                    return (
                                                        <div key={key} className="flex items-center justify-between gap-2">
                                                            <span className={cn('text-sm', on ? 'text-foreground' : 'text-muted-foreground')}>
                                                                {actionLabel(module, action, lang)}
                                                                {!live && <span className="ml-1 text-[11px] italic opacity-70">({t('coming_soon_tag')})</span>}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => { if (!locked) toggle(key); }}
                                                                disabled={locked}
                                                                className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60', on ? 'bg-brand' : 'bg-muted')}
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                                                                        on ? 'left-[1.125rem]' : 'left-0.5',
                                                                    )}
                                                                >
                                                                    {on && <Check className="h-2.5 w-2.5 text-brand" />}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
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

    if (isLoading) return <div className="p-5"><CardGridSkeleton count={4} cols={4} /></div>;

    return (
        <div className="space-y-4 p-5">
            {/* Default Role Group selector */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
                <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t('perm_default_group')}</div>
                    <button
                        onClick={() => {
                            setPendingDefault(defaultGroupId);
                            setDefaultDialog(true);
                        }}
                        className="flex h-9 w-64 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm transition-colors hover:bg-accent"
                    >
                        {defaultGroup ? (
                            <>
                                <Users className="h-4 w-4 shrink-0 text-brand" />
                                <span className="truncate font-medium text-brand">{defaultGroup.name}</span>
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
                <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                    {t('gr_empty')}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {groups.map((g) => {
                    const isDefault = g.id === defaultGroupId;
                    // Only a super admin may edit or delete the Administrator role group.
                    const adminLocked = g.role === 'super' && !isSuper;
                    return (
                        <Card key={g.id} className={cn('p-4', isDefault && 'ring-2 ring-brand/40')}>
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-semibold">{g.name}</span>
                                        {isDefault && (
                                            <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
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
                                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {g.role_label && (
                                <span className="mt-2 inline-block rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                                    {g.role_label}
                                </span>
                            )}
                            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
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

    return (
        <div className="space-y-3 px-5 py-3">
            {hasRoleChange && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground line-through">{details.from}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="rounded bg-brand/10 px-2 py-0.5 font-medium text-brand">{details.to}</span>
                </div>
            )}
            {hasPermDiff && (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {(details.added ?? []).length > 0 && (
                        <div className="min-w-0">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                                {lang === 'th' ? 'เพิ่มสิทธิ์' : 'Added'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(details.added ?? []).map((key) => {
                                    const [mod, act] = key.split('.');
                                    return (
                                        <span key={key} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                                {lang === 'th' ? 'ถอดสิทธิ์' : 'Removed'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(details.removed ?? []).map((key) => {
                                    const [mod, act] = key.split('.');
                                    return (
                                        <span key={key} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
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

function AuditTab() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<10 | 20 | 50 | 100>(20);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const { data, isLoading } = useAuditLogs(page, pageSize);
    const logs = data?.data ?? [];
    const meta = data?.meta;
    const totalPages = meta?.last_page ?? 1;
    const total = meta?.total ?? 0;
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    const hasDetails = (d: AuditDetails | null): boolean => {
        if (!d) return false;
        return (d.added?.length ?? 0) > 0 || (d.removed?.length ?? 0) > 0 || d.from !== undefined || d.to !== undefined;
    };

    const handlePageSize = (size: 10 | 20 | 50 | 100) => {
        setPageSize(size);
        setPage(1);
        setExpandedId(null);
    };

    if (isLoading) return <div className="p-5"><TableSkeleton rows={8} cols={5} /></div>;

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            {[t('audit_time'), t('audit_user'), 'Action', t('audit_target'), ''].map((h) => (
                                <th key={h} className="px-5 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                                    {t('audit_empty')}
                                </td>
                            </tr>
                        )}
                        {logs.map((l) => {
                            const isExpanded = expandedId === l.id;
                            const showDetails = hasDetails(l.details);
                            return (
                                <>
                                    <tr
                                        key={l.id}
                                        onClick={() => showDetails && setExpandedId(isExpanded ? null : l.id)}
                                        className={cn(
                                            'border-b border-border/60 transition-colors',
                                            showDetails && 'cursor-pointer hover:bg-accent/40',
                                            isExpanded && 'bg-accent/30',
                                            !isExpanded && 'last:border-0',
                                        )}
                                    >
                                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                                            {new Date(l.created_at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')}
                                        </td>
                                        <td className="px-5 py-2.5">{l.user_name}</td>
                                        <td className="px-5 py-2.5 font-medium">{l.action}</td>
                                        <td className="px-5 py-2.5 text-muted-foreground">{l.target ?? '—'}</td>
                                        <td className="px-5 py-2.5">
                                            {showDetails && (
                                                <button
                                                    className={cn(
                                                        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                                                        isExpanded ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                                    )}
                                                    aria-label="View details"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && l.details && (
                                        <tr key={`${l.id}-detail`} className="border-b border-border/60 bg-accent/20">
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => handlePageSize(Number(v) as 10 | 20 | 50 | 100)}
                    >
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
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-1 font-medium text-foreground">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
