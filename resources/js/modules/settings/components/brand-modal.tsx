import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import type { Brand } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Boxes } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useBrandMutations } from '../hooks/use-master-data';

/** BrandModal — add or edit a brand; Save shows a spinner, then a tick, then the dialog closes. */
export function BrandModal({ open, brand, onClose }: { open: boolean; brand?: Brand | null; onClose: () => void }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(brand ?? null);
    useEffect(() => {
        if (open) setShown(brand ?? null);
    }, [open, brand]);
    const view = open ? (brand ?? null) : shown;
    const confirmEdit = useConfirmEdit();
    const { create, update } = useBrandMutations();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(brand?.name ?? '');
            setDescription(brand?.description ?? '');
            setNameError(undefined);
            setSaved(false);
            clearFormError();
        }
    }, [open, brand, clearFormError]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (name !== (brand?.name ?? '') || description !== (brand?.description ?? ''));
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
        if (brand && isDirty && !(await confirmEdit({ name: brand.name }))) return;
        const payload = { name: name.trim(), description: description.trim() || null };
        formError.clear();
        try {
            if (brand) {
                await update.mutateAsync({ id: brand.id, ...payload });
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
                    title={view ? t('md_edit_brand') : t('md_add_brand')}
                    code={view?.name}
                    srDescription={t('md_modal_desc')}
                />
                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <Field label={t('md_brand_name')} required error={nameError}>
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
