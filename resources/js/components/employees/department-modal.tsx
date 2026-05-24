import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartmentMutations, useEmployees, useLocations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Department } from '@/types';
import { useEffect, useMemo, useState } from 'react';

const empty = { name: '', name_th: '', head: '', location: '' };

export function DepartmentModal({ open, onClose, department }: { open: boolean; onClose: () => void; department: Department | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useDepartmentMutations();
    const { data: employees = [] } = useEmployees();
    const { data: locations = [] } = useLocations();
    const [form, setForm] = useState(empty);

    useEffect(() => {
        if (open)
            setForm(
                department
                    ? { name: department.name, name_th: department.name_th ?? '', head: department.head ?? '', location: department.location ?? '' }
                    : empty,
            );
    }, [open, department]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const employeeOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: lang === 'th' ? e.name_th ?? e.name : e.name,
                label: lang === 'th' ? e.name_th ?? e.name : e.name,
                sub: e.code,
                search: `${e.name} ${e.name_th ?? ''} ${e.code}`,
            })),
        [employees, lang],
    );

    const submit = async () => {
        if (!form.name.trim()) return;
        if (department) await update.mutateAsync({ id: department.id, payload: form });
        else await create.mutateAsync(form);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{department ? t('edit_department') : t('add_department')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('dept_name_en')}>
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Finance" />
                        </Field>
                        <Field label={t('dept_name_th')}>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder="ฝ่ายการเงิน" />
                        </Field>
                    </div>
                    <Field label={t('dept_head')}>
                        <SearchableSelect value={form.head} onChange={(v) => set('head', v)} options={employeeOptions} />
                    </Field>
                    <Field label={t('dept_location')}>
                        <Select value={form.location || undefined} onValueChange={(v) => set('location', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('select_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.name}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!form.name.trim() || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
