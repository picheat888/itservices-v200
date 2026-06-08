import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePositionMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { Position } from '@/types';
import { useEffect, useState } from 'react';

export function PositionModal({ open, onClose, position }: { open: boolean; onClose: () => void; position: Position | null }) {
    const t = useT();
    const { create, update } = usePositionMutations();
    const [title, setTitle] = useState('');
    const [level, setLevel] = useState(1);

    useEffect(() => {
        if (open) {
            setTitle(position?.title ?? '');
            setLevel(position?.level ?? 1);
        }
    }, [open, position]);

    const submit = async () => {
        if (!title.trim()) return;
        if (position) await update.mutateAsync({ id: position.id, title, level });
        else await create.mutateAsync({ title, level });
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
                <Field label={t('pos_level')}>
                    <Input
                        type="number"
                        min={1}
                        max={20}
                        value={level}
                        onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))}
                    />
                </Field>
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
