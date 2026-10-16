import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { fieldError, refusalText } from '@/shared/lib/api-errors';
import type { Department } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDepartmentMutations } from '../hooks/use-departments';

const empty = { name: '', name_th: '', tag: '' };

type FieldErrors = Partial<Record<keyof typeof empty, string>>;

export function DepartmentModal({ open, onClose, department }: { open: boolean; onClose: () => void; department: Department | null }) {
    const t = useT();
    const { create, update } = useDepartmentMutations();
    const [form, setForm] = useState(empty);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const initial = useRef(empty);

    useEffect(() => {
        if (open) {
            setFieldErrors({});
            setError('');
            setSaved(false);
            const values = department ? { name: department.name, name_th: department.name_th ?? '', tag: department.tag ?? '' } : empty;
            setForm(values);
            initial.current = values;
        }
    }, [open, department]);

    const isDirty =
        form.name.trim() !== initial.current.name.trim() ||
        form.name_th.trim() !== initial.current.name_th.trim() ||
        form.tag.trim() !== initial.current.tag.trim();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    // Tag must be English letters / numbers only (plus space, dash, underscore). Warn live while typing.
    const tagInvalid = /[^A-Z0-9 _-]/.test(form.tag);
    const saving = create.isPending || update.isPending;
    const canSave = !!form.name.trim() && isDirty && !tagInvalid && !saving && !saved;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setFieldErrors({});
        setError('');
        // Blank code → omit it so the backend auto-generates one; a typed code is sent through as a custom badge.
        const payload = { name: form.name.trim(), name_th: form.name_th.trim() || null, tag: form.tag.trim() || undefined };
        try {
            if (department) await update.mutateAsync({ id: department.id, payload });
            else await create.mutateAsync(payload);
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (err) {
            const fields: FieldErrors = { name: fieldError(err, 'name'), name_th: fieldError(err, 'name_th'), tag: fieldError(err, 'tag') };
            setFieldErrors(fields);
            if (!fields.name && !fields.name_th && !fields.tag) setError(refusalText(err, t, 'dept_err_'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{department ? t('edit_department') : t('add_department')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="contents">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('dept_name_en')} required error={fieldErrors.name}>
                                <Input
                                    value={form.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    autoFocus
                                    aria-required
                                    placeholder={t('dept_name_en_ph')}
                                />
                            </Field>
                            <Field label={t('dept_name_th')} error={fieldErrors.name_th}>
                                <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder={t('dept_name_th_ph')} />
                            </Field>
                        </div>
                        <Field label={t('dept_code')} error={tagInvalid ? t('dept_code_en_only') : fieldErrors.tag} help={t('dept_code_hint')}>
                            <Input
                                value={form.tag}
                                onChange={(e) => set('tag', e.target.value.toUpperCase())}
                                placeholder={t('dept_code_auto')}
                                className="uppercase"
                                maxLength={50}
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </Field>
                        {error && (
                            <p role="alert" className="text-destructive flex items-center gap-1.5 text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : saved ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('saved')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
