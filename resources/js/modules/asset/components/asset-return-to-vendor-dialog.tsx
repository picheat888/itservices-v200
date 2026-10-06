import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { fieldError } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Loader2, Undo2 } from 'lucide-react';
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
    const { returnToVendor } = useAssetMutations();
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | undefined>();

    // Reset on every open — guarded by `open` so a closing dialog keeps its content while it fades out.
    useEffect(() => {
        if (!open) return;
        setNote('');
        setError(undefined);
    }, [open]);

    const submit = async () => {
        try {
            await returnToVendor.mutateAsync({ ids, reason: note.trim() || undefined });
            onDone();
        } catch (e) {
            // The server names the assets it refused (not rented, or not back in the pool).
            const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(fieldError(e, 'reason') ?? message ?? t('asset_return_vendor_failed'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle className="flex items-center gap-2">
                    <Undo2 className="text-brand h-5 w-5" aria-hidden="true" />
                    {t('asset_return_vendor_title')}
                </DialogTitle>
                <DialogDescription>
                    {t('asset_bulk_count').replace('{count}', String(ids.length))}
                    <span className="mt-1 block">{t('asset_return_vendor_desc')}</span>
                </DialogDescription>

                <div className="mt-4 space-y-4">
                    <Field label={t('asset_writeoff_note')} error={error}>
                        <Textarea
                            value={note}
                            onChange={(ev) => setNote(ev.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder={t('asset_return_vendor_note_ph')}
                        />
                    </Field>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose} disabled={returnToVendor.isPending}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={returnToVendor.isPending}>
                        {returnToVendor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                        {t('asset_return_vendor')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
