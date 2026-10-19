import { useT } from '@/lang';
import { useWriteoffReasons } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { fieldError, serverMessage } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { FlaskConicalOff } from 'lucide-react';
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
    const fmtN = useNumberFormat();
    const { bulk } = useAssetMutations();
    const { data: reasons = [] } = useWriteoffReasons();
    const [reasonId, setReasonId] = useState('');
    const [note, setNote] = useState('');
    const [reasonErr, setReasonErr] = useState<string | undefined>();
    const [noteErr, setNoteErr] = useState<string | undefined>();
    const formError = useFormError();
    const clearFormError = formError.clear;

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
        clearFormError();
    }, [open, clearFormError]);

    const isDirty = reasonId !== '' || note !== '';
    const guardClose = useDiscardGuard(open && isDirty);

    const submit = async () => {
        if (!reasonId) {
            setReasonErr(t('asset_writeoff_reason_required'));
            return;
        }
        formError.clear();
        try {
            await bulk.mutateAsync({ ids, op: 'writeoff', writeoffReasonId: Number(reasonId), reason: note.trim() || undefined });
            onDone();
        } catch (error) {
            const reasonFieldErr = fieldError(error, 'writeoff_reason_id');
            const noteFieldErr = fieldError(error, 'reason');
            setReasonErr(reasonFieldErr);
            setNoteErr(noteFieldErr);
            if (!reasonFieldErr && !noteFieldErr) formError.show(serverMessage(error) ?? t('asset_writeoff_failed'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={FlaskConicalOff}
                    eyebrow={t('asset_bulk_count').replace('{count}', fmtN(ids.length))}
                    title={t('asset_writeoff_title')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
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
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={bulk.isPending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton variant="destructive" onClick={submit} loading={bulk.isPending}>
                        <FlaskConicalOff className="h-4 w-4" />
                        {t('asset_writeoff')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
