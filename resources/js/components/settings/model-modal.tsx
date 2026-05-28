import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssetModelMutations, useBrands } from '@/hooks/use-master-data';
import { useT } from '@/lib/i18n';
import type { AssetModel, Brand } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

// Radix Select rejects "" as an item value, so use a sentinel for "no brand".
const NO_BRAND = '__none__';

/**
 * ModelModal — dialog for adding or editing an asset model with an optional
 * brand. Save button shows a spinner while saving and a checkmark on success.
 */
export function ModelModal({ open, model, onClose }: { open: boolean; model?: AssetModel | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useAssetModelMutations();
    const { data: brands = [] } = useBrands();
    const [name, setName] = useState('');
    const [brandId, setBrandId] = useState<string>(NO_BRAND);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(model?.name ?? '');
            setBrandId(model?.brand_id ? String(model.brand_id) : NO_BRAND);
        }
    }, [open, model]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        const payload = { name: name.trim(), brand_id: brandId === NO_BRAND ? null : Number(brandId) };
        try {
            if (model) {
                await update.mutateAsync({ id: model.id, ...payload });
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
                    <DialogTitle>{model ? t('md_edit_model') : t('md_add_model')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('md_brand')}>
                        <Select value={brandId} onValueChange={setBrandId}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('md_brand')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_BRAND}>—</SelectItem>
                                {brands.map((b: Brand) => (
                                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('md_model_name')} required>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('md_model_name')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
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
