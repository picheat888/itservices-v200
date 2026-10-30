<?php

// Who may see, take, assign, forward, close or note a ticket, and who may receive one.
// Answers are gate Responses carrying the codes the SPA translates (own_case, target_has_left, ...).

namespace App\Services\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Auth\Access\Response;

class TicketActionGuard
{
    /** IT staff see every ticket; everyone else only their own requests. */
    public function seesAllTickets(?User $user): bool
    {
        return (bool) $user?->hasPermission('tickets.view_all');
    }

    public function canView(?User $user, Ticket $ticket): Response
    {
        return $this->seesAllTickets($user) || $ticket->requester_id === $user?->employee_id
            ? Response::allow()
            : $this->forbidden();
    }

    /** An IT staff takes an open, unassigned case of a category their Level covers. */
    public function canTake(?User $user, Ticket $ticket): Response
    {
        return match (true) {
            ! $user?->hasPermission('tickets.resolve') => $this->forbidden(),
            ! $user->hasPermission("tickets.level_{$ticket->category?->value}") => $this->forbidden('level_not_covered'),
            $ticket->status !== TicketStatus::Open || ! $ticket->isUnassigned() => $this->refused('not_open_for_taking'),
            // Anti case-pumping: a case can never be handled by the person who filed it
            $ticket->requester_id !== null && $ticket->requester_id === $user->employee_id => $this->refused('own_case'),
            default => Response::allow(),
        };
    }

    /** A dispatcher (tickets.assign) routes an open case. */
    public function canAssign(?User $user, Ticket $ticket): Response
    {
        return match (true) {
            ! $user?->hasPermission('tickets.assign') => $this->forbidden(),
            $this->isRequester($user, $ticket) => $this->forbidden('requester_cannot_route'),
            $ticket->status !== TicketStatus::Open => $this->refused('not_open'),
            default => Response::allow(),
        };
    }

    /** The case's assignee, or a dispatcher, hands an in-progress case on (tickets.forward). */
    public function canForward(?User $user, Ticket $ticket): Response
    {
        return match (true) {
            ! $user?->hasPermission('tickets.forward') => $this->forbidden(),
            $ticket->assignee_id !== $user->id && ! $user->hasPermission('tickets.assign') => $this->forbidden(),
            $this->isRequester($user, $ticket) => $this->forbidden('requester_cannot_route'),
            ! in_array($ticket->status, TicketStatus::working(), true) => $this->refused('not_in_progress'),
            default => Response::allow(),
        };
    }

    /** Only the assignee closes or writes progress on their in-progress case (tickets.resolve). */
    public function canWork(?User $user, Ticket $ticket): Response
    {
        return match (true) {
            ! $user?->hasPermission('tickets.resolve') => $this->forbidden(),
            $ticket->assignee_id !== $user->id => $this->forbidden('not_assignee'),
            ! in_array($ticket->status, TicketStatus::working(), true) => $this->refused('not_in_progress'),
            default => Response::allow(),
        };
    }

    /** Assign hands a case to someone else; taking it yourself is what Take Case is for. */
    public function canAssignTo(User $actor, User $staff, Ticket $ticket): Response
    {
        return $staff->id === $actor->id ? $this->refused('self_assign') : $this->canReceive($staff, $ticket);
    }

    /** A case only lands with someone able to work it. */
    public function canReceive(User $staff, Ticket $ticket): Response
    {
        return match (true) {
            $staff->employee_id !== null && $staff->employee_id === $ticket->requester_id => $this->refused('target_is_requester'),
            $staff->employee?->hasLeft() === true => $this->refused('target_has_left'),
            ! $staff->hasPermission('tickets.resolve') => $this->refused('target_cannot_work'),
            ! $staff->hasPermission("tickets.level_{$ticket->category?->value}") => $this->refused('target_level_not_covered'),
            default => Response::allow(),
        };
    }

    /** A repair class needs its own key and a target priced for the case's category. */
    public function canReclassify(User $user, Ticket $ticket, TicketWorkClass $class): Response
    {
        $priced = $ticket->category !== null
            && isset(TicketSla::rules()[SlaScope::WorkClass->value][TicketSla::workClassKey($ticket->category->value, $class->value)]);

        return match (true) {
            ! $user->hasPermission('tickets.set_work_class') => $this->forbidden(),
            $class->isRepair() && ! $priced => $this->refused('no_work_class_target'),
            default => Response::allow(),
        };
    }

    /** Whoever filed a case does not decide who works it, tickets.assign or not. */
    private function isRequester(User $user, Ticket $ticket): bool
    {
        return $user->employee_id !== null && $user->employee_id === $ticket->requester_id;
    }

    /** 403; an empty code answers like abort(403). */
    private function forbidden(string $code = ''): Response
    {
        return Response::deny($code);
    }

    private function refused(string $code): Response
    {
        return Response::denyWithStatus(422, $code);
    }
}
