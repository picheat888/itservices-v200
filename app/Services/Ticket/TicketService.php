<?php

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;

class TicketService
{
    /**
     * Create a new ticket from a requester. It starts Open and unassigned with no
     * priority — an IT staff sets those when they take or are assigned the case.
     *
     * @param  array{subject:string, description:string, category:string, callback_phone?:?string, related_asset_id?:?int}  $data
     */
    public function create(array $data, Employee $requester): Ticket
    {
        return Ticket::create([
            'subject' => $data['subject'],
            'description' => $data['description'],
            'category' => $data['category'],
            'callback_phone' => $data['callback_phone'] ?? null,
            // Requester may optionally point at the device the issue is about; IT can
            // still (re)link one when taking the case.
            'related_asset_id' => $data['related_asset_id'] ?? null,
            'priority' => null,
            'status' => TicketStatus::Open,
            'requester_id' => $requester->id,
            'assignee_id' => null,
        ]);
    }

    /**
     * Correct a ticket's descriptive fields (subject / Thai subject / description /
     * category / callback phone). Workflow fields — priority, status, assignee — are
     * intentionally left untouched; those move only through take / assign / resolve.
     *
     * @param  array{subject:string, description:string, category:string, callback_phone:string}  $data
     */
    public function update(Ticket $ticket, array $data): Ticket
    {
        $ticket->update([
            'subject' => $data['subject'],
            'description' => $data['description'],
            'category' => $data['category'],
            'callback_phone' => $data['callback_phone'],
        ]);

        return $ticket->fresh();
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
            'responded_at' => $ticket->responded_at ?? now(),
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
            'responded_at' => $ticket->responded_at ?? now(),
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
