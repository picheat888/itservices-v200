import { Field } from '@/shared/components/field';
import { IconPicker } from '@/shared/components/icon-picker';
import { SaveButton } from '@/shared/components/save-button';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useCategoryMutations } from '../hooks/use-master-data';
import { useT } from '@/lang';
import { useToastStore } from '@/stores/toast';
import { hasFieldError } from '@/shared/lib/api-errors';
import type { Category } from '@/shared/types';
import { useEffect, useState } from 'react';

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
    const [icon, setIcon] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(category?.name ?? '');
            setNameTh(category?.name_th ?? '');
            setIcon(category?.icon ?? null);
            setDescription(category?.description ?? '');
            setNameError(undefined);
        }
    }, [open, category]);

    const submit = async () => {
        if (!name.trim()) {
            return;
        }
        setNameError(undefined);
        const payload = {
            name: name.trim(),
            name_th: nameTh.trim() || undefined,
            icon: icon || null,
            description: description.trim() || undefined,
        };
        try {
            if (category) {
                await update.mutateAsync({ id: category.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch (err) {
            useToastStore.getState().push(hasFieldError(err, 'name') ? t('md_name_taken') : t('cd_error'), 'error');
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
                        <Field label={t('md_category_name_en')} required error={nameError}>
                            <Input
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setNameError(undefined);
                                }}
                                autoFocus
                                placeholder={t('md_category_name_en')}
                                onKeyDown={(e) => e.key === 'Enter' && submit()}
                            />
                        </Field>
                        <Field label={t('md_category_name_th')}>
                            <Input
                                value={nameTh}
                                onChange={(e) => setNameTh(e.target.value)}
                                placeholder={t('md_category_name_th')}
                                onKeyDown={(e) => e.key === 'Enter' && submit()}
                            />
                        </Field>
                    </div>
                    <Field label={t('md_category_icon')} help={t('md_category_icon_help')}>
                        <IconPicker value={icon} onChange={setIcon} placeholder={t('md_category_icon_pick')} />
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
