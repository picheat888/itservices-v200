import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Check, Info, Loader2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTicketMutations, useTicketStaff } from '../hooks/use-tickets';
import { TICKET_PRIORITY_META } from './ticket-meta';

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

/** Super admin assigns an open case to a chosen IT staff with a priority. */
export function AssignTicketModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { assign } = useTicketMutations();
    const { data: staff = [] } = useTicketStaff(!!ticket);
    const [assigneeId, setAssigneeId] = useState('');
    const [priority, setPriority] = useState<TicketPriority>('medium');

    const staffOptions = useMemo(() => staff.map((s) => ({ value: String(s.id), label: s.name, search: s.name })), [staff]);

    useEffect(() => {
        if (ticket) {
            setAssigneeId('');
            setPriority('medium');
        }
    }, [ticket]);

    const submit = async () => {
        if (!ticket || !assigneeId) return;
        await assign.mutateAsync({ id: ticket.id, assignee_id: Number(assigneeId), priority });
        onClose();
    };

    const pending = assign.isPending;

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader icon={UserPlus} eyebrow="Assign" title={t('ticket_assign')} code={ticket?.ticket_no} srDescription={t('ticket_assign')} />

                <div className="flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    <Field label={t('ticket_select_staff')} required>
                        <SearchableSelect value={assigneeId} onChange={setAssigneeId} options={staffOptions} placeholder="—" />
                    </Field>

                    <Field label={t('ticket_priority')} required>
                        <div className="flex flex-wrap gap-2">
                            {PRIORITIES.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={cn(
                                        'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                                        priority === p ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {t(TICKET_PRIORITY_META[p].key)}
                                </button>
                            ))}
                        </div>
                    </Field>

                    <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('ticket_notify_assignee')}</span>
                    </div>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
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
