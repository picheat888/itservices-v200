import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Check, CheckCircle2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';

export type ResolveMode = 'complete' | 'cancel';

/** The assignee closes an in-progress case with a required resolution note. */
export function ResolveTicketModal({ ticket, mode, onClose }: { ticket: Ticket | null; mode: ResolveMode | null; onClose: () => void }) {
    const t = useT();
    const { resolve } = useTicketMutations();
    const [resolution, setResolution] = useState('');
    const [err, setErr] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;

    const open = !!ticket && !!mode;
    // Retained ticket + mode so the content and its colours don't flip during the exit animation
    const [shown, setShown] = useState<{ ticket: Ticket; mode: ResolveMode } | null>(null);
    useEffect(() => {
        if (ticket && mode) setShown({ ticket, mode });
    }, [ticket, mode]);
    const view = ticket ?? shown?.ticket ?? null;
    const isComplete = (mode ?? shown?.mode) === 'complete';

    useEffect(() => {
        if (open) {
            setResolution('');
            setErr('');
            clearFormError();
        }
    }, [open, clearFormError]);

    const submit = async () => {
        if (!ticket || !mode) return;
        if (resolution.trim().length < 10) {
            setErr(t('ticket_resolution_too_short'));
            return;
        }
        formError.clear();
        try {
            await resolve.mutateAsync({ id: ticket.id, mode, resolution: resolution.trim() });
            onClose();
        } catch (e: unknown) {
            formError.show(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = resolve.isPending;
    const guardClose = useDiscardGuard(open && resolution.trim() !== '');

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={isComplete ? CheckCircle2 : XCircle}
                    eyebrow={view?.ticket_no}
                    title={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    accent={isComplete ? undefined : '#ef4444'}
                    srDescription={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                />

                <DialogBody className="space-y-4">
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    <p className="text-muted-foreground text-sm">
                        {isComplete ? t('ticket_resolution_required') : t('ticket_cancel_reason_required')}
                    </p>
                    <Field label={isComplete ? t('ticket_resolution_details') : t('ticket_cancel_reason')} required error={err}>
                        <Textarea
                            value={resolution}
                            onChange={(e) => {
                                setResolution(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            maxLength={5000}
                            className={cn(err && 'border-destructive')}
                            placeholder={isComplete ? t('ticket_resolution_ph_complete') : t('ticket_resolution_ph_cancel')}
                        />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    {/* "Back" on the cancel dialog, so its two buttons don't both read ยกเลิก */}
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {isComplete ? t('cancel') : t('back')}
                    </Button>
                    <SaveButton variant={isComplete ? 'default' : 'destructive'} onClick={submit} loading={pending}>
                        {isComplete ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        {isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
