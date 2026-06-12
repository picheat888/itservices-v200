import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDepartmentMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { Department } from '@/types';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const empty = { name: '', name_th: '', tag: '' };

export function DepartmentModal({ open, onClose, department }: { open: boolean; onClose: () => void; department: Department | null }) {
    const t = useT();
    const { create, update } = useDepartmentMutations();
    const [form, setForm] = useState(empty);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const initial = useRef(empty);

    useEffect(() => {
        if (open) {
            setError(null);
            setSaved(false);
            const values = department
                ? { name: department.name, name_th: department.name_th ?? '', tag: department.tag ?? '' }
                : empty;
            setForm(values);
            initial.current = values;
        }
    }, [open, department]);

    const isDirty =
        !department ||
        form.name.trim() !== initial.current.name.trim() ||
        form.name_th.trim() !== initial.current.name_th.trim() ||
        form.tag.trim() !== initial.current.tag.trim();

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.name.trim()) return;
        setError(null);
        // Blank code → omit it so the backend auto-generates one (its existing
        // behaviour); a typed code is sent through as a custom badge.
        const payload = { name: form.name.trim(), name_th: form.name_th.trim() || null, tag: form.tag.trim() || undefined };
        try {
            if (department) await update.mutateAsync({ id: department.id, payload });
            else await create.mutateAsync(payload);
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (e) {
            const res = (e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }).response;
            setError(res?.data?.errors?.tag?.[0] ?? res?.data?.message ?? 'Save failed');
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
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('dept_name_en_ph')} />
                        </Field>
                        <Field label={t('dept_name_th')}>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder={t('dept_name_th_ph')} />
                        </Field>
                    </div>
                    <Field label={t('dept_code')} error={error ?? undefined}>
                        <Input
                            value={form.tag}
                            onChange={(e) => set('tag', e.target.value.toUpperCase())}
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
                    <Button onClick={submit} disabled={!form.name.trim() || !isDirty || create.isPending || update.isPending || saved}>
                        {create.isPending || update.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />{t('saving')}</>
                        ) : saved ? (
                            <><Check className="h-4 w-4" />{t('saved')}</>
                        ) : (
                            t('save')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
