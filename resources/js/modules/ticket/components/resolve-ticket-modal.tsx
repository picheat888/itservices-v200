import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Check, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';

export type ResolveMode = 'complete' | 'cancel';

/** The assignee closes an in-progress case with a required resolution note. */
export function ResolveTicketModal({ ticket, mode, onClose }: { ticket: Ticket | null; mode: ResolveMode | null; onClose: () => void }) {
    const t = useT();
    const { resolve } = useTicketMutations();
    const [resolution, setResolution] = useState('');
    const [err, setErr] = useState('');
    const [formError, setFormError] = useState('');

    const open = !!ticket && !!mode;
    // Retain "shown" copies (ticket + mode) so the content — including the
    // complete/cancel styling — doesn't flip or blank during the Radix exit animation.
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
            setFormError('');
        }
    }, [open]);

    const submit = async () => {
        if (!ticket || !mode) return;
        if (resolution.trim().length < 10) {
            setErr(t('ticket_resolution_too_short'));
            return;
        }
        setFormError('');
        try {
            await resolve.mutateAsync({ id: ticket.id, mode, resolution: resolution.trim() });
            onClose();
        } catch (e: unknown) {
            setFormError(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = resolve.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={isComplete ? CheckCircle2 : XCircle}
                    eyebrow="Resolve"
                    title={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    code={view?.ticket_no}
                    accent={isComplete ? undefined : '#ef4444'}
                    srDescription={isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    {formError && (
                        <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm">
                            {formError}
                        </div>
                    )}

                    <p className="text-muted-foreground text-sm">{t('ticket_resolution_required')}</p>
                    <Field label={t('ticket_resolution_details')} required error={err}>
                        <Textarea
                            value={resolution}
                            onChange={(e) => {
                                setResolution(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            className={cn(err && 'border-destructive')}
                            placeholder={isComplete ? t('ticket_resolution_ph_complete') : t('ticket_resolution_ph_cancel')}
                        />
                    </Field>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button variant={isComplete ? 'default' : 'destructive'} onClick={submit} disabled={pending}>
                        {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isComplete ? (
                            <Check className="h-4 w-4" />
                        ) : (
                            <X className="h-4 w-4" />
                        )}
                        {isComplete ? t('ticket_mark_complete') : t('ticket_mark_canceled')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
