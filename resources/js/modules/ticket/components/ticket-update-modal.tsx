import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { cn } from '@/shared/lib/utils';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTicketMutations } from '../hooks/use-tickets';

/**
 * The assignee writes a progress note on a case in flight — the part of a case that used to be
 * said out loud and recorded nowhere.
 *
 * A note never moves the case: it stays In progress and its SLA clock keeps running.
 */
export function TicketUpdateModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { addUpdate } = useTicketMutations();
    const [body, setBody] = useState('');
    const [err, setErr] = useState('');

    const open = !!ticket;
    // Retain a "shown" copy so the content doesn't blank during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    useEffect(() => {
        if (ticket) {
            setBody('');
            setErr('');
        }
    }, [ticket]);

    const submit = async () => {
        if (!ticket) return;
        if (body.trim().length < 5) {
            setErr(t('ticket_update_too_short'));
            return;
        }
        await addUpdate.mutateAsync({ id: ticket.id, body: body.trim() });
        onClose();
    };

    const saving = addUpdate.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={MessageSquarePlus}
                    eyebrow="Progress"
                    title={t('ticket_update_title')}
                    code={view?.ticket_no}
                    srDescription={t('ticket_update_title')}
                />

                <div className="flex-1 space-y-4 overflow-y-auto border-t px-6 py-6">
                    <p className="text-muted-foreground text-sm">{t('ticket_update_hint')}</p>
                    <Field label={t('ticket_update_body')} required error={err}>
                        <Textarea
                            value={body}
                            onChange={(e) => {
                                setBody(e.target.value);
                                setErr('');
                            }}
                            rows={5}
                            className={cn(err && 'border-destructive')}
                            placeholder={t('ticket_update_placeholder')}
                        />
                    </Field>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('ticket_update_save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
