import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { SerialToggle } from '@/components/shared/serial-toggle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCategoryMutations } from '@/hooks/use-master-data';
import { useT } from '@/lib/i18n';
import type { Category } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

/**
 * CategoryModal — dialog for adding or editing a category. The Save button
 * shows a spinner while saving and a checkmark on success, then auto-closes.
 */
export function CategoryModal({ open, category, onClose }: { open: boolean; category?: Category | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useCategoryMutations();
    const [name, setName] = useState('');
    const [nameTh, setNameTh] = useState('');
    const [description, setDescription] = useState('');
    const [trackSerial, setTrackSerial] = useState(false);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(category?.name ?? '');
            setNameTh(category?.name_th ?? '');
            setDescription(category?.description ?? '');
            setTrackSerial(category?.track_serial ?? false);
        }
    }, [open, category]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        const payload = {
            name: name.trim(),
            name_th: nameTh.trim() || undefined,
            description: description.trim() || undefined,
            track_serial: trackSerial,
        };
        try {
            if (category) {
                await update.mutateAsync({ id: category.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Something went wrong.' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{category ? t('md_edit_category') : t('md_add_category')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_category_name_en')} required>
                            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('md_category_name_en')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                        </Field>
                        <Field label={t('md_category_name_th')}>
                            <Input value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder={t('md_category_name_th')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                        </Field>
                    </div>
                    <Field label={t('md_description')}>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('md_description')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    </Field>
                    <SerialToggle value={trackSerial} onChange={setTrackSerial} />
                </div>
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
