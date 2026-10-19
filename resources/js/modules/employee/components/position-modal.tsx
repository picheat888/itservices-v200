import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { fieldError, refusalText } from '@/shared/lib/api-errors';
import type { Position } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm, useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { usePositionMutations } from '../hooks/use-positions';

export function PositionModal({ open, onClose, position }: { open: boolean; onClose: () => void; position: Position | null }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(position);
    useEffect(() => {
        if (open) setShown(position);
    }, [open, position]);
    const view = open ? position : shown;
    const confirm = useConfirm();
    const confirmEdit = useConfirmEdit();
    const { create, update } = usePositionMutations();
    const [title, setTitle] = useState('');
    const [allowSpecial, setAllowSpecial] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;

    useEffect(() => {
        if (open) {
            setTitle(position?.title ?? '');
            setAllowSpecial(position?.allow_special_position ?? false);
            setError('');
            clearFormError();
            setSaved(false);
        }
    }, [open, position, clearFormError]);

    const isDirty = title.trim() !== (position?.title ?? '') || allowSpecial !== (position?.allow_special_position ?? false);
    const guardClose = useDiscardGuard(open && isDirty && !saved);
    const saving = create.isPending || update.isPending;
    const canSave = !!title.trim() && isDirty && !saving && !saved;

    // Warn before flipping the special flag (both when adding and editing).
    const toggleSpecial = (next: boolean) =>
        confirm({
            variant: 'warn',
            title: t('pos_allow_special'),
            description: next ? t('pos_allow_special_confirm_on') : t('pos_allow_special_confirm_off'),
            action: () => setAllowSpecial(next),
        });

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        if (position && !(await confirmEdit({ name: position.title, sub: position.code }))) return;
        setError('');
        formError.clear();
        const payload = { title: title.trim(), allow_special_position: allowSpecial };
        try {
            if (position) await update.mutateAsync({ id: position.id, ...payload });
            else await create.mutateAsync(payload);
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (err) {
            const titleError = fieldError(err, 'title');
            if (titleError) setError(titleError);
            else formError.show(refusalText(err, t, 'pos_err_'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            {/* Title and labelled fields say it all: no description, stated explicitly (Radix / WAI-ARIA) */}
            <FormDialogContent>
                <FocusDialogHeader icon={Users} eyebrow={t('employees')} title={view ? t('edit_position') : t('add_position')} code={view?.title} />
                <form onSubmit={submit} className="contents">
                    <DialogBody>
                        <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                        <Field label={t('pos_title')} required error={error || undefined}>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                autoFocus
                                aria-required
                                placeholder={t('pos_title_ph')}
                                autoComplete="off"
                            />
                        </Field>
                        {/* Special position */}
                        <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t('pos_allow_special')}</div>
                                <div className="text-muted-foreground mt-0.5 text-xs">{t('pos_allow_special_help')}</div>
                            </div>
                            <Switch checked={allowSpecial} onChange={toggleSpecial} aria-label={t('pos_allow_special')} />
                        </div>
                    </DialogBody>
                    <DialogFooterBar>
                        <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <SaveButton type="submit" loading={saving} success={saved} disabled={!canSave} />
                    </DialogFooterBar>
                </form>
            </FormDialogContent>
        </Dialog>
    );
}
