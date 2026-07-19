import { useT } from '@/lang';
import { useDepartments, useEmployees } from '@/modules/employee';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';
import type { AccessKind, AccessMember } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useToastStore, type ToastIcon } from '@/stores/toast';
import { Folder, Globe, Package, Pencil, Plus, SquarePen, Trash2, User, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccessMutations, useResourceMembers, useSetEmailGroupOwner, useSetFileShareOwner } from '../hooks/use-access';
import { AccessBadge } from './access-badge';

/** The resource a member dialog is bound to, with enough detail for the header. */
export type MemberTarget = {
    kind: AccessKind;
    id: number;
    name: string;
    /** Sub line under the title (email / path / url). */
    detail?: string | null;
    /** Resource owner display name (email groups & file shares). */
    owner?: string | null;
    /** Current owner's employee id — lets the email-group owner picker prefill. */
    ownerEmployeeId?: number | null;
    /** Department label (email groups) or size label (file shares). */
    metaLabel?: string | null;
    metaValue?: string | null;
    /** Resource code (MG-/FS-/SM-/SW-) shown as a chip. */
    code?: string | null;
    /** Accent color (social platforms use the platform color). */
    color?: string | null;
};

// Access levels offered per kind; only file shares grade access. Email-group owner
// lives on the group (setOwner); social/software members carry no level.
const LEVELS: Record<AccessKind, string[]> = {
    'email-groups': [],
    'file-shares': ['Write', 'Read'],
    'social-platforms': [],
    software: [],
};

// Small status dot per level, matching AccessBadge's color coding.
const LEVEL_DOT: Record<string, string> = {
    Read: 'bg-muted-foreground/50',
    Write: 'bg-blue-500',
};

// Display label per stored level — "Write" grants read+write, so it reads as "Read/Write".
const LEVEL_LABEL: Record<string, string> = {
    Read: 'Read',
    Write: 'Read/Write',
};

// Per-kind icon tile accent (matches the registry tables / design tokens).
const KIND_META: Record<AccessKind, { icon: typeof Users; color: string; eyebrow: string }> = {
    'email-groups': { icon: Users, color: '#7c3aed', eyebrow: 'access_email_groups' },
    'file-shares': { icon: Folder, color: '#0d9488', eyebrow: 'access_file_shares' },
    'social-platforms': { icon: Globe, color: '#6366f1', eyebrow: 'access_social' },
    software: { icon: Package, color: '#f59e0b', eyebrow: 'access_software' },
};

/**
 * Centered focus dialog for managing an access resource's people. Header, an Owner
 * (approver) tier for email groups, the member list rendered as a fill-height
 * DataTable (same treatment as the Contract detail's Assets tab — top search +
 * standard pager footer), and a footer to edit the group's own details.
 */
export function MembersDrawer({
    target,
    canManage,
    onClose,
    onEdit,
}: {
    target: MemberTarget | null;
    canManage: boolean;
    onClose: () => void;
    /** Open the resource's edit form (the footer "Edit" action). */
    onEdit?: (target: MemberTarget) => void;
}) {
    const t = useT();
    const confirm = useConfirm();
    const toast = (msg: string, icon?: ToastIcon) => useToastStore.getState().push(msg, 'success', undefined, icon);
    // Retain the last target so the dialog keeps rendering its content while it
    // animates closed (target goes null on close; without this the body blanks mid-exit).
    const [shown, setShown] = useState<MemberTarget | null>(target);
    useEffect(() => {
        if (target) setShown(target);
    }, [target]);
    const tgt = target ?? shown;

    const kind = tgt?.kind ?? 'email-groups';
    const { data: members = [], isLoading } = useResourceMembers(kind, tgt?.id ?? null);
    const { data: employees = [] } = useEmployees();
    const { data: departments = [] } = useDepartments();
    const { addMember, revokeMember, remove } = useAccessMutations(kind);
    // Owner tier exists for email groups (required approver) and file shares (required owner).
    const setEmailOwner = useSetEmailGroupOwner();
    const setFileShareOwner = useSetFileShareOwner();
    const setOwnerMut = kind === 'file-shares' ? setFileShareOwner : setEmailOwner;
    const [empId, setEmpId] = useState('');
    const [level, setLevel] = useState('');
    const [ownerId, setOwnerId] = useState('');
    const [editingOwner, setEditingOwner] = useState(false);

    // Keep the owner picker in sync with whichever group is open (tgt, not target,
    // so it doesn't reset while the dialog animates closed) and leave edit mode.
    useEffect(() => {
        setOwnerId(tgt?.ownerEmployeeId ? String(tgt.ownerEmployeeId) : '');
        setEditingOwner(false);
    }, [tgt?.id, tgt?.ownerEmployeeId]);

    // Commit the owner change explicitly (Save), then drop back to display mode.
    const saveOwner = async () => {
        if (!tgt) return;
        await setOwnerMut.mutateAsync({ id: tgt.id, ownerEmployeeId: ownerId ? Number(ownerId) : null });
        setEditingOwner(false);
        toast(t('access_owner_updated'), 'users');
    };

    // Removing a member is destructive — confirm (with their name) before revoking.
    const askRemove = (m: AccessMember) =>
        confirm({
            variant: 'danger',
            entity: { name: m.employee ?? '—' },
            action: async () => {
                if (!tgt) return;
                await revokeMember.mutateAsync({ id: tgt.id, membershipId: m.id });
                // Delete reads clearer in the destructive palette — red card + trash icon.
                useToastStore.getState().push(t('access_member_removed'), 'error', undefined, 'trash');
            },
        });

    // Deleting the whole resource is destructive + confirms with its name. The confirm
    // dialog owns the in-flight/error state (a failed delete keeps it open with cd_error).
    // Await it so the confirm dialog finishes closing BEFORE we close the drawer — closing
    // both Radix dialogs at once races their portal teardown (removeChild) and corrupts the
    // tree, which broke a second consecutive delete. On success: red trash toast, then close.
    const askDeleteResource = async () => {
        if (!tgt) return;
        const ok = await confirm({
            variant: 'danger',
            entity: { name: tgt.name },
            action: () => remove.mutateAsync(tgt.id),
        });
        if (ok) {
            useToastStore.getState().push(t('access_resource_deleted'), 'error', undefined, 'trash');
            onClose();
        }
    };

    // employee_id -> employee, so a member row can show its code + department tag.
    const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
    const deptTag = useMemo(() => new Map(departments.map((d) => [d.id, d.tag])), [departments]);

    // Employees already on this resource — existing members plus the owner (email groups /
    // file shares). Excluded from the add-member picker so the same person can't be added twice.
    const takenIds = useMemo(() => {
        const ids = new Set(members.map((m) => m.employee_id));
        if (tgt?.ownerEmployeeId) ids.add(tgt.ownerEmployeeId);
        return ids;
    }, [members, tgt?.ownerEmployeeId]);
    // Show the most recently added member first (granted_at desc, id as the tiebreaker
    // since it auto-increments in insertion order and granted_at may be null on old rows).
    const sortedMembers = useMemo(
        () =>
            [...members].sort((a, b) => {
                const ta = a.granted_at ? Date.parse(a.granted_at) : 0;
                const tb = b.granted_at ? Date.parse(b.granted_at) : 0;
                return tb !== ta ? tb - ta : b.id - a.id;
            }),
        [members],
    );
    const empOption = (filterTaken: boolean): SearchOption[] =>
        employees
            .filter((e) => !filterTaken || !takenIds.has(e.id))
            .map((e) => ({
                value: String(e.id),
                label: e.name,
                sub: e.code,
                tag: e.department_id != null ? (deptTag.get(e.department_id) ?? undefined) : undefined,
                search: `${e.name} ${e.name_th ?? ''} ${e.code} ${e.department ?? ''}`,
            }));
    const addOpts = useMemo(() => empOption(true), [employees, takenIds, deptTag]); // eslint-disable-line react-hooks/exhaustive-deps
    const ownerOpts = useMemo(() => empOption(false), [employees, deptTag]); // eslint-disable-line react-hooks/exhaustive-deps

    const levels = LEVELS[kind];
    const meta = KIND_META[kind];
    const Icon = meta.icon;
    const isSocial = kind === 'social-platforms';
    const isEmail = kind === 'email-groups';
    const isFileShare = kind === 'file-shares';
    const tileColor = isSocial && tgt?.color ? tgt.color : meta.color;
    // Display name of the currently-selected owner (resolved from the picked id).
    const ownerName = ownerId ? (empById.get(Number(ownerId))?.name ?? tgt?.owner ?? null) : null;

    const add = async () => {
        if (!empId || !tgt) return;
        await addMember.mutateAsync({
            id: tgt.id,
            payload: {
                employee_id: Number(empId),
                access_level: levels.length ? level || levels[levels.length - 1] : null,
            },
        });
        setEmpId('');
        setLevel('');
        toast(t('access_member_added'), 'users');
    };

    // Small department tag chip for a member row (resolved from the employee record).
    const deptChip = (m: AccessMember) => {
        const emp = empById.get(m.employee_id);
        const dept = emp?.department_id != null ? deptTag.get(emp.department_id) : undefined;
        return dept ? (
            <span className="bg-accent text-muted-foreground inline-block rounded px-1.5 py-0.5 text-[10px] font-medium">{dept}</span>
        ) : (
            <span className="text-muted-foreground">—</span>
        );
    };

    const columns: Column<AccessMember>[] = [
        {
            key: 'member',
            header: t('access_name'),
            render: (m) => {
                const emp = empById.get(m.employee_id);
                return (
                    <div className="flex items-center gap-2.5">
                        <UserAvatar
                            name={m.employee}
                            photoUrl={m.photo_url ?? emp?.photo_url}
                            className="h-7 w-7 shrink-0"
                            textClassName="text-[10px]"
                        />
                        <span className="truncate text-sm font-medium">{m.employee ?? '—'}</span>
                        {emp?.code && <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{emp.code}</span>}
                    </div>
                );
            },
        },
        { key: 'dept', header: t('access_department'), render: deptChip },
        ...(kind === 'file-shares'
            ? [{ key: 'level', header: t('access_access_level'), render: (m: AccessMember) => <AccessBadge level={m.access_level} /> }]
            : []),
        ...(canManage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (m: AccessMember) => (
                          <div className="flex justify-end">
                              <button
                                  type="button"
                                  title={t('access_remove')}
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-7 w-7 place-items-center rounded-md transition-colors"
                                  onClick={() => askRemove(m)}
                              >
                                  <Trash2 className="h-4 w-4" />
                              </button>
                          </div>
                      ),
                  },
              ]
            : []),
    ];

    // Bilingual member search (name + department both have TH/EN variants).
    const memberSearch = (m: AccessMember) => {
        const emp = empById.get(m.employee_id);
        return `${m.employee ?? ''} ${emp?.name ?? ''} ${emp?.name_th ?? ''} ${emp?.code ?? ''} ${emp?.department ?? ''} ${emp?.department_th ?? ''} ${m.granted_by ?? ''}`;
    };

    return (
        <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-72px)] w-full max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {tgt && (
                    <>
                        {/* Header — shared focus-dialog header (same as contract View/Edit) */}
                        <FocusDialogHeader
                            icon={Icon}
                            accent={tileColor}
                            eyebrow={t(meta.eyebrow)}
                            title={tgt.name}
                            code={tgt.code ?? undefined}
                            srDescription={tgt.name}
                            subtitle={
                                tgt.detail || (tgt.metaValue && kind !== 'email-groups') ? (
                                    <>
                                        {tgt.detail && <span className="text-muted-foreground font-mono text-xs">{tgt.detail}</span>}
                                        {tgt.metaValue && kind !== 'email-groups' && (
                                            <span className="bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-[10.5px] font-semibold">
                                                {tgt.metaValue}
                                            </span>
                                        )}
                                    </>
                                ) : undefined
                            }
                        />

                        {/* Owner tier — required for both: email groups (approver) + file shares (owner). Not clearable; save is blocked until one is picked. */}
                        {(isEmail || isFileShare) && (
                            <div className="border-border border-t px-6 py-4">
                                <SectionLabel>{isEmail ? t('access_owner_approver') : t('access_owner')}</SectionLabel>
                                <p className="text-muted-foreground -mt-1 mb-2.5 text-xs">{t('access_owner_hint')}</p>
                                {canManage ? (
                                    editingOwner ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <SearchableSelect
                                                    value={ownerId}
                                                    onChange={setOwnerId}
                                                    options={ownerOpts}
                                                    placeholder={t('access_pick_employee')}
                                                    clearable={false}
                                                />
                                            </div>
                                            <SaveButton
                                                loading={setOwnerMut.isPending}
                                                disabled={!ownerId}
                                                onClick={saveOwner}
                                                className="shrink-0"
                                            />
                                        </div>
                                    ) : (
                                        <div className="border-border bg-background flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                                            <User className="text-muted-foreground h-4 w-4 shrink-0" />
                                            <span className={cn('flex-1 truncate', !ownerName && 'text-muted-foreground')}>{ownerName ?? '—'}</span>
                                            <button
                                                type="button"
                                                title={t('edit')}
                                                onClick={() => setEditingOwner(true)}
                                                className="text-muted-foreground hover:bg-accent hover:text-foreground -mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex items-center gap-2 text-sm font-semibold">
                                        <User className="text-muted-foreground h-3.5 w-3.5" />
                                        {ownerName ?? '—'}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Members — DataTable sized to content; body scrolls past maxBodyHeight */}
                        <div className="border-border border-t px-6 py-4">
                            <SectionLabel>
                                {t('access_members')} · {members.length}
                            </SectionLabel>
                            <div>
                                <DataTable
                                    columns={columns}
                                    rows={sortedMembers}
                                    rowKey={(m) => m.id}
                                    searchable={memberSearch}
                                    pageSize={7}
                                    rowHeight={49}
                                    loading={isLoading}
                                    emptyState={
                                        <div className="flex flex-col items-center gap-1.5 py-4">
                                            <Users className="text-muted-foreground/40 h-8 w-8" />
                                            <span className="text-foreground font-medium">{t('access_no_members')}</span>
                                            <span className="text-xs">{t('access_no_members_hint')}</span>
                                        </div>
                                    }
                                    actions={
                                        canManage ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground shrink-0 text-sm font-medium">{t('access_add_member')}</span>
                                                <div className="w-96">
                                                    <SearchableSelect
                                                        value={empId}
                                                        onChange={setEmpId}
                                                        options={addOpts}
                                                        placeholder={t('access_pick_employee')}
                                                        clearable
                                                    />
                                                </div>
                                                {levels.length > 0 && (
                                                    <Select value={level || levels[levels.length - 1]} onValueChange={setLevel}>
                                                        <SelectTrigger className="h-9 w-32 shrink-0">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {levels.map((l) => (
                                                                <SelectItem key={l} value={l}>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className={cn('h-1.5 w-1.5 rounded-full', LEVEL_DOT[l])} />
                                                                        {LEVEL_LABEL[l] ?? l}
                                                                    </span>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                <SaveButton
                                                    size="sm"
                                                    className="h-9 shrink-0"
                                                    disabled={!empId}
                                                    loading={addMember.isPending}
                                                    onClick={add}
                                                >
                                                    <Plus className="h-4 w-4" /> {t('access_add')}
                                                </SaveButton>
                                            </div>
                                        ) : undefined
                                    }
                                />
                            </div>
                        </div>

                        {/* Footer — delete the whole resource (subtle, left) + edit its own details (right). */}
                        {canManage && (
                            <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                                <Button
                                    variant="ghost"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={askDeleteResource}
                                    disabled={isLoading || members.length > 0}
                                >
                                    <Trash2 className="h-4 w-4" /> {t('delete')}
                                </Button>
                                {/* Backend blocks deleting a resource that still has members — explain why it's disabled. */}
                                {members.length > 0 && <span className="text-muted-foreground text-xs">{t('access_delete_has_members')}</span>}
                                {onEdit && (
                                    <Button variant="outline" className="ml-auto" onClick={() => tgt && onEdit(tgt)}>
                                        <SquarePen className="h-4 w-4" /> {t('edit')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
