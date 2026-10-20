import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { AlertIconCircle } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { FileQuestion } from 'lucide-react';

/** The centred-alert frame for this panel; a focus dialog showing it as content passes this over its own class. */
export const recordMissingContentClass = 'h-auto w-[calc(100vw-2rem)] max-w-sm rounded-[14px] shadow-2xl sm:rounded-[14px] [&>button]:hidden';

/** A `?view=<id>` record that cannot be read (deleted, or not this account's to open); one wording covers both. */
export function RecordMissing({ onClose }: { onClose: () => void }) {
    const t = useT();

    return (
        <div className="grid gap-4 p-6 text-center">
            <AlertIconCircle icon={FileQuestion} tone="neutral" />
            <div>
                <DialogTitle className="mb-1 text-base leading-normal font-semibold tracking-normal text-balance">
                    {t('cmn_empty_record_missing')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm text-pretty">{t('cmn_empty_record_missing_hint')}</DialogDescription>
            </div>
            {/* Focus lands here: inside an open detail dialog the hidden cross would otherwise drop it */}
            <Button autoFocus className="w-full font-semibold" onClick={onClose}>
                {t('close')}
            </Button>
        </div>
    );
}

/** The same panel in its own frame, for pages whose detail drawer returns nothing when the record is gone. */
export function RecordMissingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={cn(recordMissingContentClass, 'gap-0 p-0')}>
                <RecordMissing onClose={onClose} />
            </DialogContent>
        </Dialog>
    );
}
