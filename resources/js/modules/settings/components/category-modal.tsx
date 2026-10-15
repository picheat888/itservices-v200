import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { IconPicker } from '@/shared/components/icon-picker';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { Category } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCategoryMutations } from '../hooks/use-master-data';

/** CategoryModal — add or edit a category; Save shows a spinner, then a tick, then the dialog closes. */
export function CategoryModal({ open, category, onClose }: { open: boolean; category?: Category | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useCategoryMutations();
    const [name, setName] = useState('');
    const [nameTh, setNameTh] = useState('');
    const [icon, setIcon] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(category?.name ?? '');
            setNameTh(category?.name_th ?? '');
            setIcon(category?.icon ?? null);
            setDescription(category?.description ?? '');
            setNameError(undefined);
            setSaved(false);
        }
    }, [open, category]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty =
        !saved &&
        (name !== (category?.name ?? '') ||
            nameTh !== (category?.name_th ?? '') ||
            (icon || null) !== (category?.icon || null) ||
            description !== (category?.description ?? ''));
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
        const payload = {
            name: name.trim(),
            name_th: nameTh.trim() || null,
            icon: icon || null,
            description: description.trim() || null,
        };
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
                useToastStore.getState().push(t('cd_error'), 'error', t('cd_error_title'));
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{category ? t('md_edit_category') : t('md_add_category')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_category_name_en')} required error={nameError}>
                            <Input
                                ref={nameRef}
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
                            <Input value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={120} onKeyDown={onEnter} />
                        </Field>
                    </div>
                    <Field label={t('md_category_icon')} help={t('md_category_icon_help')} controlId="category-icon">
                        <IconPicker id="category-icon" value={icon} onChange={setIcon} placeholder={t('md_category_icon_pick')} />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} onKeyDown={onEnter} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
