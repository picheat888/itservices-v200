import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { fieldError } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { FlaskConicalOff, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/**
 * Write off the selected Ready assets, with a required note on how each one left — thrown
 * away, sold for scrap, donated, returned at the end of a lease, in the admin's own words.
 * There is deliberately no fixed list of disposal methods: the note is the record, and it
 * stays on the asset (last_reason) where the detail drawer shows it.
 */
export function AssetWriteoffDialog({ ids, open, onClose, onDone }: { ids: number[]; open: boolean; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const { bulk } = useAssetMutations();
    const [note, setNote] = useState('');
    const [err, setErr] = useState<string | undefined>();

    // Reset on every open — guarded by `open` so a closing dialog keeps the text while it fades out.
    useEffect(() => {
        if (!open) return;
        setNote('');
        setErr(undefined);
    }, [open]);

    const submit = async () => {
        if (!note.trim()) {
            setErr(t('asset_writeoff_note_required'));
            return;
        }
        try {
            await bulk.mutateAsync({ ids, op: 'writeoff', reason: note.trim() });
            onDone();
        } catch (error) {
            setErr(fieldError(error, 'reason') ?? t('asset_writeoff_failed'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle className="flex items-center gap-2">
                    <FlaskConicalOff className="text-destructive h-5 w-5" />
                    {t('asset_writeoff_title')}
                </DialogTitle>
                <DialogDescription>{t('asset_bulk_count').replace('{count}', String(ids.length))}</DialogDescription>

                <div className="mt-4">
                    <Field label={t('asset_writeoff_note')} required error={err}>
                        <Textarea
                            value={note}
                            onChange={(ev) => setNote(ev.target.value)}
                            rows={4}
                            autoFocus
                            maxLength={500}
                            placeholder={t('asset_writeoff_note_ph')}
                        />
                    </Field>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose} disabled={bulk.isPending}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={submit} disabled={bulk.isPending}>
                        {bulk.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConicalOff className="h-4 w-4" />}
                        {t('asset_writeoff')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
