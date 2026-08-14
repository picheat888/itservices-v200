<?php

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\TicketSlaAlertNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\TicketSla;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Scheduled sweep over active tickets that fires SLA alerts:
 *
 * - at 80% of the target (at_risk) → a bell nudge
 * - past the target (breached)     → a bell alert + templated email (ticket.sla_breach)
 *
 * Recipients follow the workflow: while a ticket waits for a take (response
 * clock) everyone who can take it (tickets.resolve) is warned; once it's in
 * progress (resolution clock) the assignee is warned, and a breach additionally
 * escalates to everyone who can re-assign (tickets.assign).
 *
 * Each warning fires ONCE per clock, tracked by the sla_*_alert_level columns
 * (null → at_risk → breached). The columns reset whenever the deadline itself
 * moves (take/assign re-pins it, SLA settings recompute it).
 */
class TicketSlaAlertService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * @return array{at_risk: int, breached: int}
     */
    public function run(): array
    {
        $sent = ['at_risk' => 0, 'breached' => 0];

        Ticket::query()
            ->whereIn('status', [TicketStatus::Open, TicketStatus::InProgress])
            ->chunkById(200, function ($tickets) use (&$sent) {
                foreach ($tickets as $ticket) {
                    $sla = TicketSla::forTicket($ticket);
                    if ($sla === null || ! in_array($sla['state'], ['at_risk', 'breached'], true)) {
                        continue;
                    }

                    $clock = $ticket->status === TicketStatus::Open && $ticket->responded_at === null ? 'response' : 'resolve';
                    $column = "sla_{$clock}_alert_level";

                    // One-way escalation, each stage sent once: null → at_risk → breached.
                    $already = $ticket->{$column};
                    if ($already === 'breached' || $already === $sla['state']) {
                        continue;
                    }

                    $this->notify($ticket, $clock, $sla['state']);

                    $ticket->timestamps = false; // the sweep is not an edit — keep updated_at
                    $ticket->forceFill([$column => $sla['state']])->saveQuietly();
                    $sent[$sla['state']]++;
                }
            });

        return $sent;
    }

    /** Bell for every recipient; a breach also sends the templated email. */
    private function notify(Ticket $ticket, string $clock, string $state): void
    {
        $recipients = $this->recipientsFor($ticket, $clock, $state);
        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients, new TicketSlaAlertNotification($ticket, "{$clock}_{$state}"));

        if ($state === 'breached') {
            foreach ($recipients as $user) {
                $this->email->sendTemplate('ticket.sla_breach', $user->email, [
                    'user.first_name' => strtok((string) $user->name, ' '),
                    'ticket.id' => $ticket->ticket_no,
                    'ticket.subject' => $ticket->subject,
                    'reference.id' => $ticket->ticket_no,
                ], url("/tickets?view={$ticket->id}"), 'Open ticket', $user->name);
            }
        }
    }

    /**
     * @return Collection<int, User>
     */
    private function recipientsFor(Ticket $ticket, string $clock, string $state): Collection
    {
        if ($clock === 'response') {
            // Nobody owns the case yet — warn everyone whose Level lets them take it.
            return $this->takersFor($ticket);
        }

        $assignee = User::find($ticket->assignee_id);
        $recipients = collect($assignee ? [$assignee] : []);

        if ($state === 'breached') {
            // A blown resolution target escalates to everyone who can re-assign.
            $recipients = $recipients->merge(
                User::all()->filter(fn (User $u) => $u->hasPermission('tickets.assign'))->values()
            );
        }

        return $recipients->unique('id')->values();
    }

    /**
     * Staff able to take this specific case: tickets.resolve + the matching Level.
     *
     * @return Collection<int, User>
     */
    private function takersFor(Ticket $ticket): Collection
    {
        return User::all()->filter(
            fn (User $u) => $u->hasPermission('tickets.resolve')
                && $u->hasPermission("tickets.level_{$ticket->category?->value}"),
        )->values();
    }
}
