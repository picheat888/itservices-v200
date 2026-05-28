import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useBrandMutations } from '@/hooks/use-master-data';
import { useT } from '@/lib/i18n';
import type { Brand } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

/**
 * BrandModal — dialog for adding or editing a brand. The Save button shows a
 * spinner while saving and a checkmark on success, then auto-closes.
 */
export function BrandModal({ open, brand, onClose }: { open: boolean; brand?: Brand | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useBrandMutations();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(brand?.name ?? '');
            setDescription(brand?.description ?? '');
        }
    }, [open, brand]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        const payload = { name: name.trim(), description: description.trim() || undefined };
        try {
            if (brand) {
                await update.mutateAsync({ id: brand.id, ...payload });
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
                    <DialogTitle>{brand ? t('md_edit_brand') : t('md_add_brand')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('md_brand_name')} required>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('md_brand_name')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('md_description')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    </Field>
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
