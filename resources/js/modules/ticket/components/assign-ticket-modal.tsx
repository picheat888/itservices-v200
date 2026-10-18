import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { refusalText } from '@/shared/lib/api-errors';
import type { Ticket, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Check, Info, Loader2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTicketMutations, useTicketStaff } from '../hooks/use-tickets';
import { PriorityPicker } from './priority-picker';

// A dispatcher assigns an open case to another IT staff, with a priority unless it came from a request.
export function AssignTicketModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { assign } = useTicketMutations();
    // Retained copy so the content doesn't blank during the exit animation
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;
    // Only staff whose Ticket Level covers this case's category can receive it
    const { data: staff = [] } = useTicketStaff(!!view, view?.category);
    const { user: me } = useAuth();
    const [assigneeId, setAssigneeId] = useState('');
    const [priority, setPriority] = useState<TicketPriority>('medium');
    const [formError, setFormError] = useState('');
    const fromRequest = !!view?.from_request;

    // Never yourself (that is Take case) nor the person who filed it; the API refuses both
    const staffOptions = useMemo(
        () =>
            staff
                .filter((s) => s.id !== me?.id)
                .filter((s) => s.employee_id == null || s.employee_id !== view?.requester_id)
                .map((s) => ({ value: String(s.id), label: s.name, search: s.name })),
        [staff, me, view],
    );

    useEffect(() => {
        if (ticket) {
            setAssigneeId('');
            setPriority('medium');
            setFormError('');
        }
    }, [ticket]);

    const submit = async () => {
        if (!ticket || !assigneeId) return;
        setFormError('');
        try {
            await assign.mutateAsync({ id: ticket.id, assignee_id: Number(assigneeId), priority: fromRequest ? undefined : priority });
            onClose();
        } catch (e: unknown) {
            setFormError(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = assign.isPending;
    const isDirty = assigneeId !== '' || (!fromRequest && priority !== 'medium');
    const guardClose = useDiscardGuard(!!ticket && isDirty);

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-visible p-0">
                <FocusDialogHeader
                    icon={UserPlus}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_assign')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    srDescription={t('ticket_assign')}
                />

                <div className="flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    {formError && (
                        <div
                            key={formError}
                            className="bg-destructive/10 dark:text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm text-red-700"
                        >
                            {formError}
                        </div>
                    )}

                    <Field label={t('ticket_select_staff')} required>
                        <SearchableSelect value={assigneeId} onChange={setAssigneeId} options={staffOptions} preferDown />
                    </Field>

                    {!fromRequest && (
                        <Field label={t('ticket_priority')} required>
                            <PriorityPicker value={priority} onChange={setPriority} label={t('ticket_priority')} />
                        </Field>
                    )}

                    <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('ticket_notify_assignee')}</span>
                    </div>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 rounded-b-lg border-t px-6 py-3.5">
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!assigneeId || pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {t('ticket_assign')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
