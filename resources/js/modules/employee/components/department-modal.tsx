import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { fieldError, refusalText } from '@/shared/lib/api-errors';
import { localName } from '@/shared/lib/local-name';
import type { Department } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useDepartmentMutations, useDepartments } from '../hooks/use-departments';

const empty = { name: '', name_th: '', tag: '' };

type FieldErrors = Partial<Record<keyof typeof empty, string>>;

export function DepartmentModal({ open, onClose, department }: { open: boolean; onClose: () => void; department: Department | null }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(department);
    useEffect(() => {
        if (open) setShown(department);
    }, [open, department]);
    const view = open ? department : shown;
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { create, update } = useDepartmentMutations();
    const [form, setForm] = useState(empty);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    // What the form opened with, moved along by refreshes of the department
    const [base, setBase] = useState(empty);
    const { data: allDepartments } = useDepartments();
    const toValues = (d: Department) => ({ name: d.name, name_th: d.name_th ?? '', tag: d.tag ?? '' });
    const live = department ? allDepartments?.find((d) => d.id === department.id) : undefined;

    useSeedOnce(open ? (department?.id ?? 'new') : null, () => {
        setFieldErrors({});
        clearFormError();
        setSaved(false);
        const values = department ? toValues(live ?? department) : empty;
        setForm(values);
        setBase(values);
    });
    useFormRebase({ fresh: open && live ? toValues(live) : null, base, setBase, setForm });

    const isDirty = form.name.trim() !== base.name.trim() || form.name_th.trim() !== base.name_th.trim() || form.tag.trim() !== base.tag.trim();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    // Tag must be English letters / numbers only (plus space, dash, underscore). Warn live while typing.
    const tagInvalid = /[^A-Z0-9 _-]/.test(form.tag);
    const saving = create.isPending || update.isPending;
    const canSave = !!form.name.trim() && isDirty && !tagInvalid && !saving && !saved;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        if (department && !(await confirmEdit({ name: localName(department, lang), sub: department.code }))) return;
        setFieldErrors({});
        formError.clear();
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
            if (!fields.name && !fields.name_th && !fields.tag) formError.show(refusalText(err, t, 'dept_err_'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            {/* Title and labelled fields say it all: no description, stated explicitly (Radix / WAI-ARIA) */}
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Users}
                    eyebrow={t('employees')}
                    title={view ? t('edit_department') : t('add_department')}
                    srDescription={t('form_modal_desc')}
                    code={view ? localName(view, lang) : undefined}
                />
                <form onSubmit={submit} className="contents">
                    <DialogBody>
                        <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('dept_name_en')} required error={fieldErrors.name}>
                                <Input
                                    value={form.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    autoFocus
                                    aria-required
                                    placeholder={t('dept_name_en_ph')}
                                    autoComplete="off"
                                />
                            </Field>
                            <Field label={t('dept_name_th')} error={fieldErrors.name_th}>
                                <Input
                                    value={form.name_th}
                                    onChange={(e) => set('name_th', e.target.value)}
                                    placeholder={t('dept_name_th_ph')}
                                    autoComplete="off"
                                />
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
                    </DialogBody>
                    <DialogFooterBar>
                        <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <SaveButton type="submit" loading={saving} success={saved} disabled={!canSave} />
                    </DialogFooterBar>
                </form>
            </FormDialogContent>
        </Dialog>
    );
}
