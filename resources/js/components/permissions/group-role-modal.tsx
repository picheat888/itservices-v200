import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGroupRoleMutations, usePermissionMatrix } from '@/hooks/use-permissions';
import { useDepartments, useEmployees } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { departmentApi } from '@/services/orgApi';
import type { GroupRole } from '@/services/permissionApi';
import { useUiStore } from '@/stores/ui';
import { Info, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface DeptEmployee {
    id: number;
    name: string;
    name_th?: string | null;
    code: string;
}

export function GroupRoleModal({ open, onClose, group }: { open: boolean; onClose: () => void; group: GroupRole | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useGroupRoleMutations();
    const { data: matrix } = usePermissionMatrix();
    const { data: employees = [] } = useEmployees();
    const { data: departments = [] } = useDepartments();

    const [name, setName] = useState('');
    const [role, setRole] = useState<string>('');
    const [empIds, setEmpIds] = useState<number[]>([]);
    const [deptIds, setDeptIds] = useState<number[]>([]);

    // Department employee expansion panel
    const [expandedDeptId, setExpandedDeptId] = useState<number | null>(null);
    const [deptMembers, setDeptMembers] = useState<DeptEmployee[]>([]);
    const [deptMembersLoading, setDeptMembersLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setName(group?.name ?? '');
            setRole(group?.role ?? '');
            setEmpIds(group?.employee_ids ?? []);
            setDeptIds(group?.department_ids ?? []);
            setExpandedDeptId(null);
            setDeptMembers([]);
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

    const submit = async () => {
        if (!name.trim()) return;
        const payload = { name, role: role || null, employee_ids: empIds, department_ids: deptIds };
        if (group) await update.mutateAsync({ id: group.id, payload });
        else await create.mutateAsync(payload);
        onClose();
    };

    return (
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

                    {/* Department selector — click to expand member list */}
                    <Field label={t('gr_departments')}>
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {departments.map((d) => {
                                    const on = deptIds.includes(d.id);
                                    const isExpanded = expandedDeptId === d.id;
                                    return (
                                        <div key={d.id} className="flex items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setDeptIds((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))}
                                                className={cn(
                                                    'rounded-l-full border px-2.5 py-1 text-xs transition-colors',
                                                    on ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-accent/50',
                                                )}
                                            >
                                                {lang === 'th' ? d.name_th ?? d.name : d.name}
                                            </button>
                                            <button
                                                type="button"
                                                title={t('gr_dept_members')}
                                                onClick={() => handleDeptToggle(d.id)}
                                                className={cn(
                                                    'rounded-r-full border border-l-0 px-1.5 py-1 text-xs transition-colors',
                                                    isExpanded ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-accent/50',
                                                )}
                                            >
                                                <Users className="h-3 w-3" />
                                            </button>
                                        </div>
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
                    <Button onClick={submit} disabled={!name.trim() || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
