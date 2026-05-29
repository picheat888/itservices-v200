import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGroupRoleMutations, useGroupRoles, usePermissionMatrix } from '@/hooks/use-permissions';
import { useDepartments, useEmployees } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { departmentApi } from '@/services/orgApi';
import type { GroupRole } from '@/services/permissionApi';
import { useUiStore } from '@/stores/ui';
import { ArrowRight, Check, Info, Loader2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface DeptEmployee {
    id: number;
    name: string;
    name_th?: string | null;
    code: string;
}

/** One employee about to be moved out of their current group into this one. */
interface MoveRow {
    id: number;
    name: string;
    fromGroup: string;
    fromRole: string;
    toRole: string;
}

export function GroupRoleModal({ open, onClose, group }: { open: boolean; onClose: () => void; group: GroupRole | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useGroupRoleMutations();
    const { data: matrix } = usePermissionMatrix();
    const { data: employees = [] } = useEmployees();
    const { data: departments = [] } = useDepartments();
    const { data: groupsData } = useGroupRoles();

    const [name, setName] = useState('');
    const [role, setRole] = useState<string>('');
    const [empIds, setEmpIds] = useState<number[]>([]);

    // Review-before-move: holds the employees that will be pulled out of another
    // group on save. When non-null, the confirmation dialog is shown.
    const [pendingMoves, setPendingMoves] = useState<MoveRow[] | null>(null);

    // Brief "Saved" success state shown on the save/OK button before the modal closes.
    const [saved, setSaved] = useState(false);

    // Department employee expansion panel
    const [expandedDeptId, setExpandedDeptId] = useState<number | null>(null);
    const [deptMembers, setDeptMembers] = useState<DeptEmployee[]>([]);
    const [deptMembersLoading, setDeptMembersLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setName(group?.name ?? '');
            setRole(group?.role ?? '');
            setEmpIds(group?.employee_ids ?? []);
            setExpandedDeptId(null);
            setDeptMembers([]);
            setPendingMoves(null);
            setSaved(false);
        }
    }, [open, group]);

    /** Load employees for a department and toggle the expansion panel. */
    const handleDeptToggle = async (deptId: number) => {
        // Toggle off
        if (expandedDeptId === deptId) {
            setExpandedDeptId(null);
            setDeptMembers([]);
            return;
        }
        setExpandedDeptId(deptId);
        setDeptMembersLoading(true);
        try {
            const members = await departmentApi.members(deptId);
            setDeptMembers(members);
        } finally {
            setDeptMembersLoading(false);
        }
    };

    /** Add all employees from the expanded department that aren't already in the list. */
    const addAllFromDept = () => {
        const newIds = deptMembers.map((e) => e.id).filter((id) => !empIds.includes(id));
        if (newIds.length > 0) setEmpIds((p) => [...p, ...newIds]);
    };

    const empOptions = useMemo(
        () =>
            employees
                .filter((e) => !empIds.includes(e.id))
                .map((e) => ({ value: String(e.id), label: lang === 'th' ? e.name_th ?? e.name : e.name, sub: e.code, search: `${e.name} ${e.name_th ?? ''} ${e.code}` })),
        [employees, empIds, lang],
    );

    /** Resolves a role key to its human label from the permission matrix. */
    const roleLabel = (roleKey: string | null) => (roleKey ? matrix?.roles.find((r) => r.value === roleKey)?.label ?? roleKey : '—');

    /** Selected employees that currently belong to a different group (a move). */
    const computeMoves = (): MoveRow[] => {
        const groups = groupsData?.data ?? [];
        return empIds.flatMap((id) => {
            const from = groups.find((g) => g.id !== group?.id && g.employee_ids.includes(id));
            if (!from) return [];
            const e = employees.find((x) => x.id === id);
            return [
                {
                    id,
                    name: e ? (lang === 'th' ? e.name_th ?? e.name : e.name) : String(id),
                    fromGroup: from.name,
                    fromRole: from.role_label ?? roleLabel(from.role),
                    toRole: roleLabel(role || null),
                },
            ];
        });
    };

    /** Commits the create/update mutation, then briefly shows a "Saved" state. */
    const persist = async () => {
        // Department is only a quick-add shortcut for picking employees — it is not
        // linked to the group (the group↔department pivot was removed).
        const payload = { name, role: role || null, employee_ids: empIds };
        if (group) await update.mutateAsync({ id: group.id, payload });
        else await create.mutateAsync(payload);
        setSaved(true);
        // Keep the dialog (review or main) open so the green check lands on the
        // button the user just clicked, then close.
        setTimeout(() => {
            setPendingMoves(null);
            onClose();
        }, 900);
    };

    /** On save: if any selected employee is moving groups, review first; else commit. */
    const submit = () => {
        if (!name.trim()) return;
        const moves = computeMoves();
        if (moves.length > 0) {
            setPendingMoves(moves);
            return;
        }
        void persist();
    };

    const saving = create.isPending || update.isPending;

    /** Save/OK button label that swaps to a spinner then a green check while saving. */
    const saveButtonLabel = (idleLabel: string) => {
        if (saved) {
            return (
                <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    {lang === 'th' ? 'บันทึกแล้ว' : 'Saved'}
                </span>
            );
        }
        if (saving) {
            return (
                <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {lang === 'th' ? 'กำลังบันทึก…' : 'Saving…'}
                </span>
            );
        }
        return idleLabel;
    };

    return (
        <>
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{group ? t('gr_edit') : t('gr_add')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('gr_name')}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Plant 1 — Managers" />
                    </Field>
                    <Field label={t('gr_role')}>
                        <Select value={role || undefined} onValueChange={setRole}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('select_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {(matrix?.roles ?? []).map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                        {r.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>

                    {/* Individual employee picker */}
                    <Field label={t('gr_employees')}>
                        <SearchableSelect value="" onChange={(v) => setEmpIds((p) => [...p, Number(v)])} options={empOptions} />
                        {empIds.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {empIds.map((id) => {
                                    const e = employees.find((x) => x.id === id);
                                    return (
                                        <span key={id} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                                            {e ? (lang === 'th' ? e.name_th ?? e.name : e.name) : id}
                                            <button type="button" onClick={() => setEmpIds((p) => p.filter((x) => x !== id))}>
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </Field>

                    {/* Quick add by department — clicking a department expands its
                        members so they can be added to the employee list above. It
                        does NOT link the department to the group. */}
                    <Field label={t('gr_departments')} help={t('gr_quick_add_dept_help')}>
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {departments.map((d) => {
                                    const isExpanded = expandedDeptId === d.id;
                                    return (
                                        <button
                                            key={d.id}
                                            type="button"
                                            title={t('gr_dept_members')}
                                            onClick={() => handleDeptToggle(d.id)}
                                            className={cn(
                                                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                                                isExpanded ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-accent/50',
                                            )}
                                        >
                                            {lang === 'th' ? d.name_th ?? d.name : d.name}
                                            <Users className="h-3 w-3" />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Expanded department member list */}
                            {expandedDeptId !== null && (
                                <div className="rounded-lg border border-border bg-muted/30 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-medium text-muted-foreground">
                                            {t('gr_dept_members')}: {departments.find((d) => d.id === expandedDeptId)?.[lang === 'th' ? 'name_th' : 'name'] ?? ''}
                                        </span>
                                        {deptMembers.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={addAllFromDept}
                                                className="flex items-center gap-1 rounded-md border border-brand px-2 py-0.5 text-xs text-brand hover:bg-brand/10"
                                            >
                                                <UserPlus className="h-3 w-3" />
                                                {lang === 'th' ? 'เพิ่มทั้งหมด' : 'Add all'}
                                            </button>
                                        )}
                                    </div>
                                    {deptMembersLoading && (
                                        <div className="py-2 text-center text-xs text-muted-foreground">…</div>
                                    )}
                                    {!deptMembersLoading && deptMembers.length === 0 && (
                                        <div className="py-2 text-center text-xs text-muted-foreground">
                                            {lang === 'th' ? 'ไม่มีพนักงานในแผนกนี้' : 'No employees in this department'}
                                        </div>
                                    )}
                                    {!deptMembersLoading && deptMembers.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {deptMembers.map((e) => {
                                                const alreadyAdded = empIds.includes(e.id);
                                                return (
                                                    <button
                                                        key={e.id}
                                                        type="button"
                                                        disabled={alreadyAdded}
                                                        onClick={() => !alreadyAdded && setEmpIds((p) => [...p, e.id])}
                                                        className={cn(
                                                            'rounded-full border px-2.5 py-1 text-xs transition-colors',
                                                            alreadyAdded
                                                                ? 'cursor-default border-brand/30 bg-brand/10 text-brand/60'
                                                                : 'border-border text-muted-foreground hover:border-brand hover:bg-brand/10 hover:text-brand',
                                                        )}
                                                    >
                                                        {lang === 'th' ? e.name_th ?? e.name : e.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Field>

                    <div className="flex items-start gap-2 rounded-lg bg-brand/5 p-2.5 text-xs text-brand">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t('gr_note')}</span>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!name.trim() || saving || saved}>
                        {saveButtonLabel(t('save'))}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Review-before-move confirmation */}
        <Dialog open={pendingMoves !== null} onOpenChange={(o) => !o && setPendingMoves(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{lang === 'th' ? 'ยืนยันการย้ายกลุ่ม' : 'Confirm group move'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {lang === 'th'
                            ? `พนักงานต่อไปนี้จะถูกย้ายมาอยู่กลุ่ม “${name}” และสิทธิ์ (role) จะเปลี่ยนตามกลุ่มใหม่ — 1 คนอยู่ได้กลุ่มเดียวเท่านั้น:`
                            : `These employees will be moved into “${name}” and their permission role will change — an employee may belong to only one group:`}
                    </p>
                    <ul className="space-y-1.5">
                        {(pendingMoves ?? []).map((m) => (
                            <li
                                key={m.id}
                                className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                            >
                                <span className="font-medium">{m.name}</span>
                                <span className="text-muted-foreground">
                                    {m.fromGroup} [{m.fromRole}]
                                </span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="text-brand">
                                    {name} [{m.toRole}]
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setPendingMoves(null)} disabled={saving || saved}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={() => void persist()} disabled={saving || saved}>
                        {saveButtonLabel('OK')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
