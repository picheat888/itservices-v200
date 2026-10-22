import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import type { Warehouse } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Boxes } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useWarehouseMutations } from '../hooks/use-master-data';

/** WarehouseModal — add or edit a stock warehouse; Save shows a spinner, then a tick, then the dialog closes. */
export function WarehouseModal({ open, warehouse, onClose }: { open: boolean; warehouse?: Warehouse | null; onClose: () => void }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(warehouse ?? null);
    useEffect(() => {
        if (open) setShown(warehouse ?? null);
    }, [open, warehouse]);
    const view = open ? (warehouse ?? null) : shown;
    const confirmEdit = useConfirmEdit();
    const { create, update } = useWarehouseMutations();
    // Fields in one state, so a refresh of the row rebases them together
    const [form, setForm] = useState({ name: '', description: '' });
    const { name, description } = form;
    const setName = (next: string) => setForm((f) => ({ ...f, name: next }));
    const setDescription = (next: string) => setForm((f) => ({ ...f, description: next }));
    // What the form opened with, moved along by refreshes of the row
    const [base, setBase] = useState({ name: '', description: '' });
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    const toValues = (r?: { name: string; description?: string | null } | null) => ({ name: r?.name ?? '', description: r?.description ?? '' });
    useSeedOnce(open ? (warehouse?.id ?? 'new') : null, () => {
        const values = toValues(warehouse);
        setForm(values);
        setBase(values);
        setNameError(undefined);
        setSaved(false);
        clearFormError();
    });
    useFormRebase({ fresh: open && warehouse ? toValues(warehouse) : null, base, setBase, setForm });

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (name !== base.name || description !== base.description);
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
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Boxes}
                    eyebrow={t('set_master_data')}
                    title={view ? t('md_edit_warehouse') : t('md_add_warehouse')}
                    code={view?.name}
                    srDescription={t('md_modal_desc')}
                />
                <DialogBody>
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
