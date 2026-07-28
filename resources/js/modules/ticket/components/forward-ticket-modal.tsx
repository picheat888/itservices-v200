import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { ArrowRightLeft, Check, Info, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTicketMutations, useTicketStaff } from '../hooks/use-tickets';

/**
 * Forward an in-progress case to another IT staff (the current assignee is stuck
 * or unavailable). Priority and the SLA deadlines stay put — only the owner changes.
 */
export function ForwardTicketModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { forward } = useTicketMutations();
    // Retain a "shown" copy so the content doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;
    // Only staff whose Ticket Level covers this case's category can receive it.
    const { data: staff = [] } = useTicketStaff(!!view, view?.category);
    const [assigneeId, setAssigneeId] = useState('');

    // The current assignee can't receive their own case again (the API rejects it too).
    const staffOptions = useMemo(
        () => staff.filter((s) => s.id !== view?.assignee_id).map((s) => ({ value: String(s.id), label: s.name, search: s.name })),
        [staff, view],
    );

    useEffect(() => {
        if (ticket) setAssigneeId('');
    }, [ticket]);

    const submit = async () => {
        if (!ticket || !assigneeId) return;
        await forward.mutateAsync({ id: ticket.id, assignee_id: Number(assigneeId) });
        onClose();
    };

    const pending = forward.isPending;

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={ArrowRightLeft}
                    eyebrow="Forward"
                    title={t('ticket_forward')}
                    code={view?.ticket_no}
                    srDescription={t('ticket_forward')}
                />

                <div className="flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    <Field label={t('ticket_select_staff')} required>
                        <SearchableSelect value={assigneeId} onChange={setAssigneeId} options={staffOptions} placeholder="—" />
                    </Field>

                    <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('ticket_forward_hint')}</span>
                    </div>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!assigneeId || pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {t('ticket_forward')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
