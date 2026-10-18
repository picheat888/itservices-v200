// Which desk actions a reader may take on one ticket; shared by the detail dialog and the row menu.
import type { Ticket } from '@/shared/types';

export interface TicketActionGates {
    /** tickets.resolve plus the matching Ticket Level. */
    canTake: boolean;
    /** tickets.resolve — updating and closing your own case */
    canResolve: boolean;
    /** tickets.assign */
    canAssign: boolean;
    /** tickets.forward */
    canForward: boolean;
    meId: number | undefined;
    meEmployeeId: number | null | undefined;
}

/** Mirrors the server's gates (permission → assignee → status), so no button is drawn that would get a 403. */
export function ticketActionFlags(ticket: Ticket, gates: TicketActionGates) {
    const isMine = ticket.assignee_id != null && ticket.assignee_id === gates.meId;
    const isWorking = ticket.status === 'in_progress';
    const isOpenUnassigned = ticket.status === 'open' && ticket.assignee_id == null;
    // A case you filed yourself: you can neither take it nor route it (anti case-pumping).
    const isMyOwnRequest = gates.meEmployeeId != null && ticket.requester_id === gates.meEmployeeId;
    const showTake = isOpenUnassigned && gates.canTake && !isMyOwnRequest;
    const showAssign = isOpenUnassigned && gates.canAssign && !isMyOwnRequest;
    const showForward = isWorking && gates.canForward && (isMine || (gates.canAssign && !isMyOwnRequest));
    const showWork = isWorking && isMine && gates.canResolve;
    return { isMine, isWorking, showTake, showAssign, showForward, showWork, hasDeskActions: showTake || showAssign || showForward || showWork };
}
