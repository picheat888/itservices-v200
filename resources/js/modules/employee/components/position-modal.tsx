import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { fieldError, refusalText } from '@/shared/lib/api-errors';
import type { Position } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { usePositionMutations } from '../hooks/use-positions';

export function PositionModal({ open, onClose, position }: { open: boolean; onClose: () => void; position: Position | null }) {
    const t = useT();
    const confirm = useConfirm();
    const { create, update } = usePositionMutations();
    const [title, setTitle] = useState('');
    const [allowSpecial, setAllowSpecial] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (open) {
            setTitle(position?.title ?? '');
            setAllowSpecial(position?.allow_special_position ?? false);
            setError('');
            setSaved(false);
        }
    }, [open, position]);

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
        setError('');
        const payload = { title: title.trim(), allow_special_position: allowSpecial };
        try {
            if (position) await update.mutateAsync({ id: position.id, ...payload });
            else await create.mutateAsync(payload);
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (err) {
            setError(fieldError(err, 'title') ?? refusalText(err, t, 'pos_err_'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{position ? t('edit_position') : t('add_position')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="contents">
                    <Field label={t('pos_title')} required error={error || undefined}>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-required placeholder={t('pos_title_ph')} />
                    </Field>
                    {/* Special position */}
                    <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('pos_allow_special')}</div>
                            <div className="text-muted-foreground mt-0.5 text-xs">{t('pos_allow_special_help')}</div>
                        </div>
                        <Switch checked={allowSpecial} onChange={toggleSpecial} aria-label={t('pos_allow_special')} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : saved ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('saved')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
