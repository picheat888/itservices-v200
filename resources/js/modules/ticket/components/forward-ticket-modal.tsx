import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalText } from '@/shared/lib/api-errors';
import type { Ticket } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { ArrowRightLeft, Check, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTicketMutations, useTicketStaff } from '../hooks/use-tickets';

// Forward an in-progress case to another IT staff; priority and SLA deadlines stay put.
export function ForwardTicketModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { forward } = useTicketMutations();
    // Retained copy so the content doesn't blank during the exit animation
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;
    // Only staff whose Ticket Level covers this case's category can receive it
    const { data: staff = [] } = useTicketStaff(!!view, view?.category);
    const [assigneeId, setAssigneeId] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;

    // Neither the current assignee nor the person who filed it; the API refuses both
    const staffOptions = useMemo(
        () =>
            staff
                .filter((s) => s.id !== view?.assignee_id)
                .filter((s) => s.employee_id == null || s.employee_id !== view?.requester_id)
                .map((s) => ({ value: String(s.id), label: s.name, search: s.name })),
        [staff, view],
    );

    useEffect(() => {
        if (ticket) {
            setAssigneeId('');
            clearFormError();
        }
    }, [ticket, clearFormError]);

    const submit = async () => {
        if (!ticket || !assigneeId) return;
        formError.clear();
        try {
            await forward.mutateAsync({ id: ticket.id, assignee_id: Number(assigneeId) });
            onClose();
        } catch (e: unknown) {
            formError.show(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = forward.isPending;
    const guardClose = useDiscardGuard(!!ticket && assigneeId !== '');

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={ArrowRightLeft}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_forward')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    srDescription={t('ticket_forward')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    <Field label={t('ticket_select_staff')} required>
                        <SearchableSelect value={assigneeId} onChange={setAssigneeId} options={staffOptions} preferDown />
                    </Field>

                    <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('ticket_forward_hint')}</span>
                    </div>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={pending} disabled={!assigneeId}>
                        <Check className="h-4 w-4" />
                        {t('ticket_forward')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
