import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { usePositionMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { Position } from '@/types';
import { useEffect, useState } from 'react';

export function PositionModal({ open, onClose, position }: { open: boolean; onClose: () => void; position: Position | null }) {
    const t = useT();
    const confirm = useConfirm();
    const { create, update } = usePositionMutations();
    const [title, setTitle] = useState('');
    const [allowSpecial, setAllowSpecial] = useState(false);

    useEffect(() => {
        if (open) {
            setTitle(position?.title ?? '');
            setAllowSpecial(position?.allow_special_position ?? false);
        }
    }, [open, position]);

    // Warn before flipping the special flag (both when adding and editing).
    const toggleSpecial = (next: boolean) =>
        confirm({
            variant: 'warn',
            title: t('pos_allow_special'),
            description: next ? t('pos_allow_special_confirm_on') : t('pos_allow_special_confirm_off'),
            action: () => setAllowSpecial(next),
        });

    const submit = async () => {
        if (!title.trim()) return;
        if (position) await update.mutateAsync({ id: position.id, title, allow_special_position: allowSpecial });
        else await create.mutateAsync({ title, allow_special_position: allowSpecial });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{position ? t('edit_position') : t('add_position')}</DialogTitle>
                </DialogHeader>
                <Field label={t('pos_title')}>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="QA Lead" />
                </Field>
                {/* Special position: employees in it can have no department / no report-to. */}
                <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t('pos_allow_special')}</div>
                        <div className="text-muted-foreground mt-0.5 text-xs">{t('pos_allow_special_help')}</div>
                    </div>
                    <Switch checked={allowSpecial} onChange={toggleSpecial} aria-label={t('pos_allow_special')} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!title.trim() || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
