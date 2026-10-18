import { useT } from '@/lang';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import type { Warehouse } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useWarehouseMutations } from '../hooks/use-master-data';

/** WarehouseModal — add or edit a stock warehouse; Save shows a spinner, then a tick, then the dialog closes. */
export function WarehouseModal({ open, warehouse, onClose }: { open: boolean; warehouse?: Warehouse | null; onClose: () => void }) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const { create, update } = useWarehouseMutations();
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
            setName(warehouse?.name ?? '');
            setDescription(warehouse?.description ?? '');
            setNameError(undefined);
            setSaved(false);
            clearFormError();
        }
    }, [open, warehouse, clearFormError]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (name !== (warehouse?.name ?? '') || description !== (warehouse?.description ?? ''));
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
        if (warehouse && isDirty && !(await confirmEdit({ name: warehouse.name }))) return;
        const payload = { name: name.trim(), description: description.trim() || null };
        formError.clear();
        try {
            if (warehouse) {
                await update.mutateAsync({ id: warehouse.id, ...payload });
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{warehouse ? t('md_edit_warehouse') : t('md_add_warehouse')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <Field label={t('md_warehouse_name')} required error={nameError}>
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
