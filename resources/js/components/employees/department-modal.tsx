import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDepartmentMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { Department } from '@/types';
import { useEffect, useState } from 'react';

const empty = { name: '', name_th: '', code: '' };

export function DepartmentModal({ open, onClose, department }: { open: boolean; onClose: () => void; department: Department | null }) {
    const t = useT();
    const { create, update } = useDepartmentMutations();
    const [form, setForm] = useState(empty);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setError(null);
            setForm(
                department
                    ? { name: department.name, name_th: department.name_th ?? '', code: department.code ?? '' }
                    : empty,
            );
        }
    }, [open, department]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.name.trim()) return;
        setError(null);
        // Blank code → omit it so the backend auto-generates one (its existing
        // behaviour); a typed code is sent through as a custom badge.
        const payload = { name: form.name.trim(), name_th: form.name_th.trim() || null, code: form.code.trim() || undefined };
        try {
            if (department) await update.mutateAsync({ id: department.id, payload });
            else await create.mutateAsync(payload);
            onClose();
        } catch (e) {
            const res = (e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }).response;
            setError(res?.data?.errors?.code?.[0] ?? res?.data?.message ?? 'Save failed');
        }
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
                    <Field label={t('dept_code')} error={error ?? undefined}>
                        <Input
                            value={form.code}
                            onChange={(e) => set('code', e.target.value.toUpperCase())}
                            placeholder={t('dept_code_auto')}
                            className="font-mono uppercase"
                            maxLength={50}
                        />
                        {!error && <p className="mt-1 text-xs text-muted-foreground">{t('dept_code_hint')}</p>}
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
