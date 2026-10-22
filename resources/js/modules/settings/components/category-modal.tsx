import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { IconPicker } from '@/shared/components/icon-picker';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import { localName } from '@/shared/lib/local-name';
import type { Category } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { Boxes } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCategoryMutations } from '../hooks/use-master-data';

type CategoryForm = { name: string; nameTh: string; icon: string | null; description: string };
const EMPTY_CATEGORY: CategoryForm = { name: '', nameTh: '', icon: null, description: '' };
// The form's values for a category (blank for a new one)
const categoryForm = (c?: Category | null): CategoryForm => ({
    name: c?.name ?? '',
    nameTh: c?.name_th ?? '',
    icon: c?.icon ?? null,
    description: c?.description ?? '',
});

/** CategoryModal — add or edit a category; Save shows a spinner, then a tick, then the dialog closes. */
export function CategoryModal({ open, category, onClose }: { open: boolean; category?: Category | null; onClose: () => void }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(category ?? null);
    useEffect(() => {
        if (open) setShown(category ?? null);
    }, [open, category]);
    const view = open ? (category ?? null) : shown;
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { create, update } = useCategoryMutations();
    // Fields in one state, so a refresh of the row rebases them together
    const [form, setForm] = useState<CategoryForm>(EMPTY_CATEGORY);
    const { name, nameTh, icon, description } = form;
    const setName = (next: string) => setForm((f) => ({ ...f, name: next }));
    const setNameTh = (next: string) => setForm((f) => ({ ...f, nameTh: next }));
    const setIcon = (next: string | null) => setForm((f) => ({ ...f, icon: next }));
    const setDescription = (next: string) => setForm((f) => ({ ...f, description: next }));
    // What the form opened with, moved along by refreshes of the row
    const [base, setBase] = useState<CategoryForm>(EMPTY_CATEGORY);
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useSeedOnce(open ? (category?.id ?? 'new') : null, () => {
        const values = categoryForm(category);
        setForm(values);
        setBase(values);
        setNameError(undefined);
        setSaved(false);
        clearFormError();
    });
    useFormRebase({ fresh: open && category ? categoryForm(category) : null, base, setBase, setForm });

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty =
        !saved && (name !== base.name || nameTh !== base.nameTh || (icon || null) !== (base.icon || null) || description !== base.description);
    const guardClose = useDiscardGuard(open && isDirty);

    const submit = async () => {
        if (saving || saved) {
            return;
        }
        if (!name.trim()) {
            setNameError(t('set_err_required'));
            nameRef.current?.focus();
            return;
        }
        setNameError(undefined);
        if (category && isDirty && !(await confirmEdit({ name: localName(category, lang) }))) return;
        const payload = {
            name: name.trim(),
            name_th: nameTh.trim() || null,
            icon: icon || null,
            description: description.trim() || null,
        };
        formError.clear();
        try {
            if (category) {
                await update.mutateAsync({ id: category.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setSaved(true);
            closeAfterSave();
        } catch (err) {
            if (hasFieldError(err, 'name')) {
                setNameError(t('md_name_taken'));
                nameRef.current?.focus();
            } else {
                formError.show(serverMessage(err) ?? t('cd_error'));
            }
        }
    };

    const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            submit();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Boxes}
                    eyebrow={t('set_master_data')}
                    title={view ? t('md_edit_category') : t('md_add_category')}
                    code={view ? localName(view, lang) : undefined}
                    srDescription={t('md_modal_desc')}
                />
                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_category_name_en')} required error={nameError}>
                            <Input
                                ref={nameRef}
                                autoComplete="off"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setNameError(undefined);
                                }}
                                autoFocus
                                maxLength={120}
                                onKeyDown={onEnter}
                            />
                        </Field>
                        <Field label={t('md_category_name_th')}>
                            <Input
                                autoComplete="off"
                                value={nameTh}
                                onChange={(e) => setNameTh(e.target.value)}
                                maxLength={120}
                                onKeyDown={onEnter}
                            />
                        </Field>
                    </div>
                    <Field label={t('md_category_icon')} help={t('md_category_icon_help')} controlId="category-icon">
                        <IconPicker id="category-icon" value={icon} onChange={setIcon} placeholder={t('md_category_icon_pick')} />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input
                            autoComplete="off"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={255}
                            onKeyDown={onEnter}
                        />
                    </Field>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
