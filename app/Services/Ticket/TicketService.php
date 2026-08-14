<?php

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\TicketAssignedNotification;
use App\Notifications\TicketCreatedNotification;
use App\Notifications\TicketForwardedNotification;
use App\Notifications\TicketOwnerNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\TicketSla;
use Illuminate\Support\Facades\Notification;

class TicketService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Create a new ticket from a requester. It starts Open and unassigned with no
     * priority — an IT staff sets those when they take or are assigned the case.
     *
     * @param  array{subject:string, description:string, category:string, callback_phone?:?string, related_asset_id?:?int}  $data
     */
    public function create(array $data, Employee $requester): Ticket
    {
        $ticket = Ticket::create([
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

        // Persist both SLA deadlines so the list can sort/filter by urgency in SQL.
        // Resolution runs on the medium fallback until a priority is set at take/assign.
        $ticket->update([
            'sla_response_due_at' => TicketSla::responseDueAt($ticket),
            'sla_resolve_due_at' => TicketSla::resolveDueAt($ticket),
        ]);

        // Bell the staff who could take this case: tickets.resolve + the matching
        // Ticket Level — never the requester themselves (they can't take it anyway).
        $takers = User::all()->filter(
            fn (User $u) => $u->employee_id !== $ticket->requester_id
                && $u->hasPermission('tickets.resolve')
                && $u->hasPermission("tickets.level_{$ticket->category?->value}"),
        )->values();
        Notification::send($takers, new TicketCreatedNotification($ticket));

        // Email the requester a confirmation carrying the case number for reference. A
        // requester with no address anywhere is logged as skipped, not dropped in silence.
        $this->email->sendTemplate('ticket.created', $this->ownerEmail($ticket), $this->ownerVars($ticket), null, null, $ticket->requester?->name);

        return $ticket;
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
            // The chosen priority fixes the real resolution deadline — any alert
            // sent against the old (medium-fallback) deadline no longer applies.
            'sla_resolve_due_at' => TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours($priority->value) * 60),
            'sla_resolve_alert_level' => null,
        ]);

        // Tell the owner their case is now in someone's hands.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'taken', $staff->name));

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
            // The chosen priority fixes the real resolution deadline — any alert
            // sent against the old (medium-fallback) deadline no longer applies.
            'sla_resolve_due_at' => TicketSla::addBusinessMinutes($ticket->created_at, TicketSla::resolveHours($priority->value) * 60),
            'sla_resolve_alert_level' => null,
        ]);

        $staff->notify(new TicketAssignedNotification($ticket->fresh()));
        // The assigned staff also gets the templated email (bell alone is easy to miss).
        $this->email->sendTemplate('ticket.assigned', $staff->email, [
            'user.first_name' => strtok((string) $staff->name, ' '),
            'ticket.id' => $ticket->ticket_no,
            'ticket.subject' => $ticket->subject,
            'reference.id' => $ticket->ticket_no,
        ], null, null, $staff->name);
        // Tell the owner their case is now in someone's hands.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'taken', $staff->name));

        return $ticket->fresh();
    }

    /**
     * Hand an in-progress case to another IT staff (the current assignee is stuck
     * or unavailable). Priority, responded_at and the SLA deadlines all stay put —
     * forwarding never restarts a clock. The receiving staff gets a bell.
     */
    public function forward(Ticket $ticket, User $staff): Ticket
    {
        $fromName = $ticket->assignee?->name;
        $ticket->update(['assignee_id' => $staff->id]);

        $staff->notify(new TicketForwardedNotification($ticket->fresh(), $fromName));
        // The receiving staff also gets the templated email (bell alone is easy to miss).
        $this->email->sendTemplate('ticket.forwarded', $staff->email, [
            'user.first_name' => strtok((string) $staff->name, ' '),
            'ticket.id' => $ticket->ticket_no,
            'ticket.subject' => $ticket->subject,
            'from.name' => $fromName ?? '—',
            'reference.id' => $ticket->ticket_no,
        ], null, null, $staff->name);
        // Tell the owner who is responsible for their case now.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'forwarded', $staff->name));

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

        // Tell the owner their case is finished — and on a successful close, email
        // them too (cancellations stay bell-only; the reason shows in the drawer).
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), $complete ? 'resolved' : 'cancelled'));
        if ($complete) {
            $this->email->sendTemplate('ticket.resolved', $this->ownerEmail($ticket), $this->ownerVars($ticket), null, null, $ticket->requester?->name);
        }

        return $ticket->fresh();
    }

    /** The login account of the case's requester — null when they have no account. */
    private function ownerUser(Ticket $ticket): ?User
    {
        return $ticket->requester_id ? User::where('employee_id', $ticket->requester_id)->first() : null;
    }

    /** Best reachable email for the requester: their login account, else the employee record. */
    private function ownerEmail(Ticket $ticket): ?string
    {
        return $this->ownerUser($ticket)?->email ?: $ticket->requester?->email;
    }

    /**
     * Template variables shared by the requester-facing ticket emails.
     *
     * @return array<string, string>
     */
    private function ownerVars(Ticket $ticket): array
    {
        return [
            'user.first_name' => strtok((string) ($ticket->requester?->name ?? ''), ' '),
            'ticket.id' => (string) $ticket->ticket_no,
            'ticket.subject' => (string) $ticket->subject,
            'reference.id' => (string) $ticket->ticket_no,
        ];
    }
}
