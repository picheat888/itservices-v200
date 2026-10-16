import { useT } from '@/lang';
import { useLocationMutations } from '@/modules/employee';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { LocationItem } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useEffect, useRef, useState } from 'react';

/** LocationModal — add or edit a location; Save shows a spinner, then a tick, then the dialog closes. */
export function LocationModal({ open, location, onClose }: { open: boolean; location?: LocationItem | null; onClose: () => void }) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const { create, update } = useLocationMutations();
    const [name, setName] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(location?.name ?? '');
            setNameError(undefined);
            setSaved(false);
        }
    }, [open, location]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && name !== (location?.name ?? '');
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
        if (location && isDirty && !(await confirmEdit({ name: location.name }))) return;
        try {
            if (location) {
                await update.mutateAsync({ id: location.id, name: name.trim() });
            } else {
                await create.mutateAsync(name.trim());
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

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{location ? t('edit_location') : t('add_location')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <Field label={t('loc_name')} required error={nameError}>
                    <Input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setNameError(undefined);
                        }}
                        autoFocus
                        maxLength={120}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                submit();
                            }
                        }}
                    />
                </Field>
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
