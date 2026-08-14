<?php

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Email\EmailNotificationService;
use App\Support\EmailTable;
use Illuminate\Support\Collection;

/**
 * The Monday summary of cases still open, mailed to the staff who work them.
 *
 * Two lists, because they need different things done to them: cases nobody has picked up yet,
 * and cases somebody holds but has not finished. Both are the team's board rather than one
 * person's queue — an unclaimed case belongs to whoever gets to it first, and a case sitting
 * with a colleague is the sort of thing a team notices for each other.
 *
 * Every list is filtered to the ticket levels the reader is allowed to work, so nobody is sent
 * a row they cannot act on.
 */
class TicketDigestService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * @return array{recipients: int, tickets: int}
     */
    public function send(): array
    {
        $live = Ticket::query()
            ->with(['requester', 'assignee'])
            ->whereIn('status', [TicketStatus::Open->value, TicketStatus::InProgress->value])
            ->orderBy('created_at')
            ->get();

        if ($live->isEmpty()) {
            return ['recipients' => 0, 'tickets' => 0];
        }

        $sent = ['recipients' => 0, 'tickets' => 0];

        foreach (User::all() as $user) {
            if (! $user->hasPermission('tickets.resolve')) {
                continue;
            }

            $mine = $live->filter(fn (Ticket $t) => $user->hasPermission("tickets.level_{$t->category?->value}"));
            if ($mine->isEmpty()) {
                continue;
            }

            $open = $mine->filter(fn (Ticket $t) => $t->status === TicketStatus::Open);
            $working = $mine->filter(fn (Ticket $t) => $t->status === TicketStatus::InProgress);

            $this->email->sendTemplate('ticket.weekly_digest', $user->email, [
                'user.first_name' => strtok((string) $user->name, ' '),
                'digest.open_count' => (string) $open->count(),
                'digest.open_table' => $this->openTable($open),
                'digest.working_count' => (string) $working->count(),
                'digest.working_table' => $this->workingTable($working),
            ], rtrim((string) config('app.url'), '/').'/tickets', 'Open the case list', $user->name);

            $sent['recipients']++;
            $sent['tickets'] += $mine->count();
        }

        return $sent;
    }

    /** Cases waiting for somebody to take them — oldest first, since those are the worry. */
    private function openTable(Collection $tickets): string
    {
        $rows = $tickets->map(fn (Ticket $t) => [
            EmailTable::link($this->ticketUrl($t), (string) $t->ticket_no),
            e((string) $t->subject),
            e($t->category?->label() ?? '-'),
            e((string) ($t->requester?->name ?? '-')),
            (string) $this->daysOpen($t),
        ])->values()->all();

        return EmailTable::render(['Ticket', 'Subject', 'Type', 'Raised by', 'Days open'], $rows, [4]);
    }

    /** Cases somebody holds — the extra column is who, so the team can see where each sits. */
    private function workingTable(Collection $tickets): string
    {
        $rows = $tickets->map(fn (Ticket $t) => [
            EmailTable::link($this->ticketUrl($t), (string) $t->ticket_no),
            e((string) $t->subject),
            e($t->category?->label() ?? '-'),
            e((string) ($t->assignee?->name ?? '-')),
            (string) $this->daysOpen($t),
        ])->values()->all();

        return EmailTable::render(['Ticket', 'Subject', 'Type', 'With', 'Days open'], $rows, [4]);
    }

    /** Whole days since the case was raised. */
    private function daysOpen(Ticket $ticket): int
    {
        return (int) ($ticket->created_at?->diffInDays(now()) ?? 0);
    }

    private function ticketUrl(Ticket $ticket): string
    {
        return rtrim((string) config('app.url'), '/')."/tickets?view={$ticket->id}";
    }
}
