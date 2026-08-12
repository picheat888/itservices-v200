import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { FileQuestion } from 'lucide-react';

/**
 * The frame this panel wants, wherever it is rendered. A focus dialog showing it as its
 * content passes this over its own class (`cn(focusDialogContentClass, missing && …)`),
 * so a two-line message is not framed by a box sized for a full detail sheet — and every
 * surface shows the same box, which is what drifted the first time round.
 */
export const recordMissingContentClass = 'h-auto max-w-[440px]';

/**
 * What a detail dialog shows when the record behind a `?view=<id>` link cannot be
 * read: it was deleted, or the link points at something this account may not open
 * (the API answers 404 either way, and it is not the SPA's place to tell a stranger
 * which of the two it is — so the wording covers both).
 *
 * Panel only, no dialog frame: dialogs that are already open on a missing record
 * render it as their content.
 *
 * The wording is deliberately generic and lives in `common` — "record" covers a
 * request, an asset, a stock item and a contract alike, and every module was about to
 * say the same sentence with its own noun swapped in.
 */
export function RecordMissing({ onClose }: { onClose: () => void }) {
    const t = useT();

    return (
        <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="bg-muted text-muted-foreground flex h-14 w-14 items-center justify-center rounded-2xl">
                <FileQuestion className="h-7 w-7" />
            </span>
            {/* The visible heading IS the accessible name — a second sr-only copy would
                read the same sentence twice to a screen reader. */}
            <DialogTitle className="mt-4 text-base font-semibold">{t('record_missing_title')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
                {t('record_missing_hint')}
            </DialogDescription>
            <Button variant="outline" className="mt-6" onClick={onClose}>
                {t('close')}
            </Button>
        </div>
    );
}

/**
 * The same panel with its own frame, for the pages whose detail drawer bails out
 * (`if (!record) return null`) before it can render anything. Mounted beside the
 * drawer and opened by the detail query's error, so a dead link says so instead of
 * quietly doing nothing — and the drawer's own retained-copy logic is left alone.
 */
export function RecordMissingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={cn(recordMissingContentClass, 'gap-0 p-0')}>
                <RecordMissing onClose={onClose} />
            </DialogContent>
        </Dialog>
    );
}
