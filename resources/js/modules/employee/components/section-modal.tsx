import { useT } from '@/lang';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalReason, refusalText } from '@/shared/lib/api-errors';
import { localName } from '@/shared/lib/local-name';
import type { Section } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { useSectionMutations } from '../hooks/use-sections';

const empty = { department_id: '', name: '', name_th: '' };

export function SectionModal({ open, onClose, section }: { open: boolean; onClose: () => void; section: Section | null }) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { create, update } = useSectionMutations();
    const [form, setForm] = useState(empty);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;
    const initial = useRef(empty);

    useEffect(() => {
        if (open) {
            setSaved(false);
            setError('');
            clearFormError();
            const values = section ? { department_id: String(section.department_id), name: section.name, name_th: section.name_th ?? '' } : empty;
            setForm(values);
            initial.current = values;
        }
    }, [open, section, clearFormError]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const isDirty =
        form.department_id !== initial.current.department_id ||
        form.name.trim() !== initial.current.name.trim() ||
        form.name_th.trim() !== initial.current.name_th.trim();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    const deptOptions = useMemo(
        () =>
            departments.map((d) => ({
                value: String(d.id),
                label: localName(d, lang),
                sub: d.tag,
                search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
            })),
        [departments, lang],
    );

    const saving = create.isPending || update.isPending;
    const canSave = !!form.department_id && !!form.name.trim() && isDirty && !saving && !saved;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        if (section && !(await confirmEdit({ name: localName(section, lang), sub: section.code }))) return;
        setError('');
        formError.clear();
        const payload = { department_id: Number(form.department_id), name: form.name.trim(), name_th: form.name_th.trim() || null };
        try {
            if (section) await update.mutateAsync({ id: section.id, payload });
            else await create.mutateAsync(payload);
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (e) {
            const text = refusalText(e, t, 'section_err_');
            if (refusalReason(e)?.reason === 'section_has_employees_move') setError(text);
            else formError.show(text);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            {/* Title and labelled fields say it all: no description, stated explicitly (Radix / WAI-ARIA) */}
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {section ? t('edit_section') : t('add_section')}
                        {section?.code && <span className="text-muted-foreground text-xs font-normal">{section.code}</span>}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="contents">
                    <div className="space-y-4">
                        <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                        <Field label={t('department')} required error={error || undefined}>
                            <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={deptOptions} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('section_name_en')} required>
                                <Input
                                    value={form.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    autoFocus
                                    aria-required
                                    placeholder={t('section_name_en_ph')}
                                    autoComplete="off"
                                />
                            </Field>
                            <Field label={t('section_name_th')}>
                                <Input
                                    value={form.name_th}
                                    onChange={(e) => set('name_th', e.target.value)}
                                    placeholder={t('section_name_th_ph')}
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <SaveButton type="submit" loading={saving} success={saved} disabled={!canSave} />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
