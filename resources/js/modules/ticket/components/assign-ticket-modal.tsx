import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalText } from '@/shared/lib/api-errors';
import type { Ticket, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Check, Info, UserPlus } from 'lucide-react';
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
    const formError = useFormError();
    const clearFormError = formError.clear;
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
            clearFormError();
        }
    }, [ticket, clearFormError]);

    const submit = async () => {
        if (!ticket || !assigneeId) return;
        formError.clear();
        try {
            await assign.mutateAsync({ id: ticket.id, assignee_id: Number(assigneeId), priority: fromRequest ? undefined : priority });
            onClose();
        } catch (e: unknown) {
            formError.show(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = assign.isPending;
    const isDirty = assigneeId !== '' || (!fromRequest && priority !== 'medium');
    const guardClose = useDiscardGuard(!!ticket && isDirty);

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={UserPlus}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_assign')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    srDescription={t('ticket_assign')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

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
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={pending} disabled={!assigneeId}>
                        <Check className="h-4 w-4" />
                        {t('ticket_assign')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
