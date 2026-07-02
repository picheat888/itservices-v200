import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useLocationMutations } from '@/modules/employee';
import { useT } from '@/lang';
import { useToastStore } from '@/stores/toast';
import type { LocationItem } from '@/shared/types';
import { useEffect, useState } from 'react';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

/**
 * LocationModal — dialog for adding or editing a location. Save button shows a
 * spinner while saving and a checkmark on success, then the dialog auto-closes.
 */
export function LocationModal({ open, location, onClose }: { open: boolean; location?: LocationItem | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useLocationMutations();
    const [name, setName] = useState('');
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(location?.name ?? '');
        }
    }, [open, location]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        try {
            if (location) {
                await update.mutateAsync({ id: location.id, name: name.trim() });
            } else {
                await create.mutateAsync(name.trim());
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            useToastStore.getState().push('Something went wrong.', 'error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{location ? t('edit_location') : t('add_location')}</DialogTitle>
                </DialogHeader>
                <Field label={t('set_locations')} required>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        placeholder={t('add_location')}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                    />
                </Field>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} onClick={submit} disabled={!name.trim()} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
