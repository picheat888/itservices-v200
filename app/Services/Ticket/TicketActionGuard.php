<?php

// Who may take, assign, forward, close or note a ticket, and who may receive one.
// Refusals abort with the codes the SPA translates (own_case, target_has_left, ...).

namespace App\Services\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;

class TicketActionGuard
{
    /** An IT staff takes an open, unassigned case of a category their Level covers. */
    public function assertCanTake(?User $user, Ticket $ticket): void
    {
        abort_unless((bool) $user?->hasPermission('tickets.resolve'), 403);
        abort_unless((bool) $user?->hasPermission("tickets.level_{$ticket->category?->value}"), 403, 'level_not_covered');
        abort_unless($ticket->status === TicketStatus::Open && $ticket->isUnassigned(), 422, 'not_open_for_taking');
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if($ticket->requester_id !== null && $ticket->requester_id === $user?->employee_id, 422, 'own_case');
    }

    /** A dispatcher (tickets.assign) routes an open case to someone else. */
    public function assertCanAssign(?User $user, Ticket $ticket): void
    {
        abort_unless((bool) $user?->hasPermission('tickets.assign'), 403);
        $this->assertNotTheRequester($user, $ticket);
        abort_unless($ticket->status === TicketStatus::Open, 422, 'not_open');
    }

    /** The case's assignee, or a dispatcher, hands an in-progress case on (tickets.forward). */
    public function assertCanForward(?User $user, Ticket $ticket): void
    {
        abort_unless((bool) $user?->hasPermission('tickets.forward'), 403);
        // A bystander holding the forward key cannot move someone else's case.
        abort_unless($ticket->assignee_id === $user?->id || (bool) $user?->hasPermission('tickets.assign'), 403);
        $this->assertNotTheRequester($user, $ticket);
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'not_in_progress');
    }

    /** Only the assignee closes or writes progress on their in-progress case (tickets.resolve). */
    public function assertWorksTheCase(?User $user, Ticket $ticket): void
    {
        abort_unless((bool) $user?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->assignee_id === $user?->id, 403, 'not_assignee');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'not_in_progress');
    }

    /** Assign hands a case to someone else; taking it yourself is what Take Case is for. */
    public function assertCanAssignTo(User $actor, User $staff, Ticket $ticket): void
    {
        abort_if($staff->id === $actor->id, 422, 'self_assign');
        $this->assertCanReceive($staff, $ticket);
    }

    /**
     * A case only lands with someone able to work it: not its requester, still working here,
     * holding tickets.resolve and the Level of the case's category.
     */
    public function assertCanReceive(User $staff, Ticket $ticket): void
    {
        abort_if($staff->employee_id !== null && $staff->employee_id === $ticket->requester_id, 422, 'target_is_requester');
        abort_if($staff->employee?->hasLeft() === true, 422, 'target_has_left');
        abort_unless($staff->hasPermission('tickets.resolve'), 422, 'target_cannot_work');
        abort_unless($staff->hasPermission("tickets.level_{$ticket->category?->value}"), 422, 'target_level_not_covered');
    }

    /**
     * Moving a case to a repair class needs its own key, and a target an administrator has
     * priced for the case's category; without one the case would fall back to the short
     * priority deadline, so it is refused rather than defaulted.
     */
    public function assertCanReclassify(User $user, Ticket $ticket, TicketWorkClass $class): void
    {
        abort_unless($user->hasPermission('tickets.set_work_class'), 403);
        abort_if(
            $class->isRepair()
                && ($ticket->category === null
                    || ! isset(TicketSla::rules()[SlaScope::WorkClass->value][TicketSla::workClassKey($ticket->category->value, $class->value)])),
            422,
            'no_work_class_target',
        );
    }

    /**
     * Whoever filed a case does not decide who works it, tickets.assign or not. Their case
     * still moves: any IT staff can take it, and any other dispatcher can route it.
     */
    private function assertNotTheRequester(?User $user, Ticket $ticket): void
    {
        $employeeId = $user?->employee_id;

        abort_if($employeeId !== null && $employeeId === $ticket->requester_id, 403, 'requester_cannot_route');
    }
}
