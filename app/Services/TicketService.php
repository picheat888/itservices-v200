<?php

namespace App\Services;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Employee;
use App\Models\Ticket;
use App\Models\User;

class TicketService
{
    /**
     * Create a new ticket from a requester. It starts Open and unassigned with no
     * priority — an IT staff sets those when they take or are assigned the case.
     *
     * @param  array{subject:string, subject_th?:?string, description:string, category:string, callback_phone?:?string}  $data
     */
    public function create(array $data, Employee $requester): Ticket
    {
        return Ticket::create([
            'subject' => $data['subject'],
            'subject_th' => $data['subject_th'] ?? null,
            'description' => $data['description'],
            'category' => $data['category'],
            'callback_phone' => $data['callback_phone'] ?? null,
            'priority' => null,
            'status' => TicketStatus::Open,
            'requester_id' => $requester->id,
            'assignee_id' => null,
        ]);
    }

    /**
     * An IT staff takes an open case for themselves: assigns it, sets priority, and
     * optionally records an initial note and the related asset. Moves to InProgress.
     */
    public function take(Ticket $ticket, User $staff, TicketPriority $priority, ?string $note, ?int $relatedAssetId): Ticket
    {
        $ticket->update([
            'assignee_id' => $staff->id,
            'priority' => $priority,
            'take_note' => $note,
            'related_asset_id' => $relatedAssetId,
            'status' => TicketStatus::InProgress,
        ]);

        return $ticket->fresh();
    }

    /**
     * A super admin assigns an open case to a specific IT staff with a priority.
     * Moves to InProgress.
     */
    public function assign(Ticket $ticket, User $staff, TicketPriority $priority): Ticket
    {
        $ticket->update([
            'assignee_id' => $staff->id,
            'priority' => $priority,
            'status' => TicketStatus::InProgress,
        ]);

        return $ticket->fresh();
    }

    /**
     * Close an in-progress case. $complete=true marks it Completed, otherwise
     * Canceled. Either way a resolution note is recorded and resolved_at is stamped.
     */
    public function resolve(Ticket $ticket, bool $complete, string $resolution): Ticket
    {
        $ticket->update([
            'status' => $complete ? TicketStatus::Completed : TicketStatus::Canceled,
            'resolution' => $resolution,
            'resolved_at' => now(),
        ]);

        return $ticket->fresh();
    }
}
