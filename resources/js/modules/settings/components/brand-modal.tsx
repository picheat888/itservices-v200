import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { Brand } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useBrandMutations } from '../hooks/use-master-data';

/** BrandModal — add or edit a brand; Save shows a spinner, then a tick, then the dialog closes. */
export function BrandModal({ open, brand, onClose }: { open: boolean; brand?: Brand | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useBrandMutations();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(brand?.name ?? '');
            setDescription(brand?.description ?? '');
            setNameError(undefined);
            setSaved(false);
        }
    }, [open, brand]);

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
        const payload = { name: name.trim(), description: description.trim() || null };
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
                useToastStore.getState().push(t('cd_error'), 'error', t('cd_error_title'));
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
                    <DialogTitle>{brand ? t('md_edit_brand') : t('md_add_brand')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('md_brand_name')} required error={nameError}>
                        <Input
                            ref={nameRef}
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
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} onKeyDown={onEnter} />
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
