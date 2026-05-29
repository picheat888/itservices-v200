import { Field } from '@/components/shared/field';
import { TICKET_PRIORITY_META } from '@/components/tickets/ticket-meta';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTicketMutations, useTicketStaff } from '@/hooks/use-tickets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Ticket, TicketPriority } from '@/types';
import { Check, Info, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

/** Super admin assigns an open case to a chosen IT staff with a priority. */
export function AssignTicketModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { assign } = useTicketMutations();
    const { data: staff = [] } = useTicketStaff(!!ticket);
    const [assigneeId, setAssigneeId] = useState('');
    const [priority, setPriority] = useState<TicketPriority>('medium');

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

    return (
        <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>{t('ticket_assign')}</SheetTitle>
                    <SheetDescription>{ticket?.ticket_no}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    <Field label={t('ticket_select_staff')} required>
                        <select
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                            className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                        >
                            <option value="">—</option>
                            {staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
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

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={!assigneeId || assign.isPending}>
                        {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {t('ticket_assign')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
