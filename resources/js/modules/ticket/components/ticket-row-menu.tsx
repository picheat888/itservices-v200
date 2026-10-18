// Kebab menu of one ticket row: view, plus the same actions the detail dialog footer offers.
import { useT } from '@/lang';
import type { Ticket } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { ArrowRightLeft, Check, Eye, MessageSquarePlus, MoreVertical, Pencil, Users, X, Zap } from 'lucide-react';
import type { ResolveMode } from './resolve-ticket-modal';
import { ticketActionFlags, type TicketActionGates } from './ticket-actions';

export function TicketRowMenu({
    ticket,
    gates,
    canEdit,
    onView,
    onEdit,
    onTake,
    onAssign,
    onForward,
    onUpdate,
    onResolve,
}: {
    ticket: Ticket;
    gates: TicketActionGates;
    canEdit: boolean;
    onView: (t: Ticket) => void;
    onEdit: (t: Ticket) => void;
    onTake: (t: Ticket) => void;
    onAssign: (t: Ticket) => void;
    onForward: (t: Ticket) => void;
    onUpdate: (t: Ticket) => void;
    onResolve: (t: Ticket, mode: ResolveMode) => void;
}) {
    const t = useT();
    const { showTake, showAssign, showForward, showWork } = ticketActionFlags(ticket, gates);
    const hasMore = canEdit || showTake || showAssign || showForward || showWork;
    return (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t('actions')} ${ticket.ticket_no}`}
                        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(ticket)}>
                        <Eye className="h-4 w-4" />
                        {t('view')}
                    </DropdownMenuItem>
                    {canEdit && (
                        <DropdownMenuItem onClick={() => onEdit(ticket)}>
                            <Pencil className="h-4 w-4" />
                            {t('edit')}
                        </DropdownMenuItem>
                    )}
                    {hasMore && <DropdownMenuSeparator />}
                    {showTake && (
                        <DropdownMenuItem onClick={() => onTake(ticket)}>
                            <Zap className="h-4 w-4" />
                            {t('ticket_take_case')}
                        </DropdownMenuItem>
                    )}
                    {showAssign && (
                        <DropdownMenuItem onClick={() => onAssign(ticket)}>
                            <Users className="h-4 w-4" />
                            {t('ticket_assign_to_staff')}
                        </DropdownMenuItem>
                    )}
                    {showWork && (
                        <DropdownMenuItem onClick={() => onUpdate(ticket)}>
                            <MessageSquarePlus className="h-4 w-4" />
                            {t('ticket_update_action')}
                        </DropdownMenuItem>
                    )}
                    {showForward && (
                        <DropdownMenuItem onClick={() => onForward(ticket)}>
                            <ArrowRightLeft className="h-4 w-4" />
                            {t('ticket_forward')}
                        </DropdownMenuItem>
                    )}
                    {showWork && (
                        <>
                            <DropdownMenuItem onClick={() => onResolve(ticket, 'complete')}>
                                <Check className="h-4 w-4" />
                                {t('ticket_mark_complete')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onResolve(ticket, 'cancel')} className="text-destructive focus:text-destructive">
                                <X className="h-4 w-4" />
                                {t('ticket_mark_canceled')}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
