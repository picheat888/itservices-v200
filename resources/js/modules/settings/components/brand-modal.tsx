import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useBrandMutations } from '../hooks/use-master-data';
import { useT } from '@/lang';
import { useToastStore } from '@/stores/toast';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { Brand } from '@/shared/types';
import { useEffect, useState } from 'react';

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
    const [nameError, setNameError] = useState<string | undefined>();
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(brand?.name ?? '');
            setDescription(brand?.description ?? '');
            setNameError(undefined);
        }
    }, [open, brand]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        setNameError(undefined);
        const payload = { name: name.trim(), description: description.trim() || undefined };
        try {
            if (brand) {
                await update.mutateAsync({ id: brand.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch (err) {
            useToastStore.getState().push(hasFieldError(err, 'name') ? t('md_name_taken') : t('cd_error'), 'error', hasFieldError(err, 'name') ? undefined : t('cd_error_title'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{brand ? t('md_edit_brand') : t('md_add_brand')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('md_brand_name')} required error={nameError}>
                        <Input
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setNameError(undefined);
                            }}
                            autoFocus
                            placeholder={t('md_brand_name')}
                            onKeyDown={(e) => e.key === 'Enter' && submit()}
                        />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('md_description')}
                            onKeyDown={(e) => e.key === 'Enter' && submit()}
                        />
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
