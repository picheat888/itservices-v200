import { useT } from '@/lang';
import { useWriteoffReasons } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { fieldError } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { FlaskConicalOff, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/**
 * Write off the selected Ready assets. The reason is picked from the list kept in Settings →
 * Assets (beyond repair, sold for scrap, donated, handed back to the lessor…) so the write-off
 * report can count by it; the note adds the details in the admin's own words and is optional.
 * Both stay on the asset (writeoff_reason_id, last_reason), where the detail drawer shows them.
 */
export function AssetWriteoffDialog({ ids, open, onClose, onDone }: { ids: number[]; open: boolean; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const { bulk } = useAssetMutations();
    const { data: reasons = [] } = useWriteoffReasons();
    const [reasonId, setReasonId] = useState('');
    const [note, setNote] = useState('');
    const [reasonErr, setReasonErr] = useState<string | undefined>();
    const [noteErr, setNoteErr] = useState<string | undefined>();

    const reasonOptions = useMemo(
        () =>
            reasons.map((r) => ({ value: String(r.id), label: r.name, sub: r.description ?? undefined, search: `${r.name} ${r.description ?? ''}` })),
        [reasons],
    );

    // Reset on every open — guarded by `open` so a closing dialog keeps its content while it fades out.
    useEffect(() => {
        if (!open) return;
        setReasonId('');
        setNote('');
        setReasonErr(undefined);
        setNoteErr(undefined);
    }, [open]);

    const submit = async () => {
        if (!reasonId) {
            setReasonErr(t('asset_writeoff_reason_required'));
            return;
        }
        try {
            await bulk.mutateAsync({ ids, op: 'writeoff', writeoffReasonId: Number(reasonId), reason: note.trim() || undefined });
            onDone();
        } catch (error) {
            setReasonErr(fieldError(error, 'writeoff_reason_id'));
            setNoteErr(fieldError(error, 'reason') ?? (fieldError(error, 'writeoff_reason_id') ? undefined : t('asset_writeoff_failed')));
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

                <div className="mt-4 space-y-4">
                    <Field label={t('asset_writeoff_reason')} required error={reasonErr}>
                        <SearchableSelect
                            value={reasonId}
                            onChange={(v) => {
                                setReasonId(v);
                                setReasonErr(undefined);
                            }}
                            options={reasonOptions}
                            placeholder={t('asset_writeoff_reason_ph')}
                        />
                    </Field>
                    <Field label={t('asset_writeoff_note')} error={noteErr}>
                        <Textarea
                            value={note}
                            onChange={(ev) => setNote(ev.target.value)}
                            rows={3}
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
