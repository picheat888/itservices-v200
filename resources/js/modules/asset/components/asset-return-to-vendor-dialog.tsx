import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { fieldError, serverMessage } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/**
 * Return the selected rented assets to their lessor (POST /assets/bulk-return-to-vendor).
 *
 * The rented asset's own way out of the register, separate from a write-off: no reason is picked
 * from the Settings list (a list anyone can rename or delete), the return itself is recorded
 * (returned_to_vendor_at), and the write-off report counts on that. The assets leave as written
 * off, keep their contract link, and are brought back with "Cancel write-off" if done by mistake.
 * The note is optional. Offered only when every selected asset is rented and Ready.
 */
export function AssetReturnToVendorDialog({ ids, open, onClose, onDone }: { ids: number[]; open: boolean; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { returnToVendor } = useAssetMutations();
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | undefined>();
    const formError = useFormError();
    const clearFormError = formError.clear;

    // Reset on every open — guarded by `open` so a closing dialog keeps its content while it fades out.
    useEffect(() => {
        if (!open) return;
        setNote('');
        setError(undefined);
        clearFormError();
    }, [open, clearFormError]);

    const guardClose = useDiscardGuard(open && note !== '');

    const submit = async () => {
        formError.clear();
        try {
            await returnToVendor.mutateAsync({ ids, reason: note.trim() || undefined });
            onDone();
        } catch (e) {
            // The server names the assets it refused (not rented, or not back in the pool).
            const noteErr = fieldError(e, 'reason');
            setError(noteErr);
            if (!noteErr) formError.show(serverMessage(e) ?? t('asset_return_vendor_failed'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Undo2}
                    eyebrow={t('asset_bulk_count').replace('{count}', fmtN(ids.length))}
                    title={t('asset_return_vendor_title')}
                    subtitle={<span className="text-muted-foreground text-sm">{t('asset_return_vendor_desc')}</span>}
                    srDescription={t('asset_return_vendor_desc')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <Field label={t('asset_writeoff_note')} error={error}>
                        <Textarea
                            value={note}
                            onChange={(ev) => setNote(ev.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder={t('asset_return_vendor_note_ph')}
                        />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={returnToVendor.isPending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={returnToVendor.isPending}>
                        <Undo2 className="h-4 w-4" />
                        {t('asset_return_vendor')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
