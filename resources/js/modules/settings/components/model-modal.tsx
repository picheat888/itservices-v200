import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { AssetModel, Brand } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useToastStore } from '@/stores/toast';
import { useEffect, useRef, useState } from 'react';
import { useAssetModelMutations, useBrands } from '../hooks/use-master-data';

// Radix Select rejects "" as an item value, so use a sentinel for "no brand".
const NO_BRAND = '__none__';

/** ModelModal — add or edit an asset model with an optional brand; Save shows a spinner, then a tick, then the dialog closes. */
export function ModelModal({ open, model, onClose }: { open: boolean; model?: AssetModel | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useAssetModelMutations();
    const { data: brands = [] } = useBrands();
    const [name, setName] = useState('');
    const [brandId, setBrandId] = useState<string>(NO_BRAND);
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(model?.name ?? '');
            setBrandId(model?.brand_id ? String(model.brand_id) : NO_BRAND);
            setNameError(undefined);
            setSaved(false);
        }
    }, [open, model]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (name !== (model?.name ?? '') || brandId !== (model?.brand_id ? String(model.brand_id) : NO_BRAND));
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
        const payload = { name: name.trim(), brand_id: brandId === NO_BRAND ? null : Number(brandId) };
        try {
            if (model) {
                await update.mutateAsync({ id: model.id, ...payload });
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

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{model ? t('md_edit_model') : t('md_add_model')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('md_brand')} controlId="model-brand">
                        <Select
                            value={brandId}
                            onValueChange={(value) => {
                                setBrandId(value);
                                setNameError(undefined);
                            }}
                        >
                            <SelectTrigger id="model-brand">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_BRAND}>{t('md_no_brand')}</SelectItem>
                                {brands.map((b: Brand) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('md_model_name')} required error={nameError}>
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
