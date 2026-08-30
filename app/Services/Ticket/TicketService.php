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

        // The same people, by mail. A bell is only seen by somebody already looking at the
        // portal, and a case nobody has picked up is exactly the thing nobody is looking at.
        foreach ($takers as $taker) {
            $this->email->sendTemplate(
                'ticket.new_case',
                $taker->email,
                ['user.first_name' => strtok((string) $taker->name, ' ')] + $this->staffVars($ticket),
                // ?tab=all as well as ?view=: the drawer opens either way, but closing it
                // on the default tab leaves the reader looking at the dashboard instead of
                // the case they just came from.
                url("/tickets?tab=all&view={$ticket->id}"),
                'Open the case',
                $taker->name,
            );
        }

        // Email the requester a confirmation carrying the case number for reference. A
        // requester with no address anywhere is logged as skipped, not dropped in silence.
        $this->email->sendTemplate(
            'ticket.created',
            $this->ownerEmail($ticket),
            $this->ownerVars($ticket),
            $this->ownerUrl($ticket),
            'Open the ticket',
            $ticket->requester?->name,
        );

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

        // Tell the owner their case is now in someone's hands — by bell and by mail. The
        // requester used to hear nothing between filing and closing: the two mails they got
        // were "we have it" and "it is done", with the whole middle silent.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'taken', $staff->name));
        $this->emailOwner($ticket, 'ticket.owner_taken', ['ticket.assignee' => (string) $staff->name]);

        return $ticket->fresh();
    }

    /**
     * A super admin assigns an open case to a specific IT staff with a priority.
     * Moves to InProgress.
     *
     * $assignedBy is carried into the mail: being handed a case is not the same as picking
     * one up, and the receiver's first question is who handed it to them.
     */
    public function assign(Ticket $ticket, User $staff, TicketPriority $priority, ?User $assignedBy = null): Ticket
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
            'actor.name' => (string) ($assignedBy?->name ?? '-'),
            'reference.id' => (string) $ticket->ticket_no,
            ...$this->staffVars($ticket),
        ], $this->staffUrl($ticket), 'Open the case', $staff->name);
        // Tell the owner their case is now in someone's hands. Same news as take() from
        // where they sit — who picked it up is IT's business, that somebody has is theirs.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'taken', $staff->name));
        $this->emailOwner($ticket, 'ticket.owner_taken', ['ticket.assignee' => (string) $staff->name]);

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
        ], $this->staffUrl($ticket), 'Open the case', $staff->name);
        // Tell the owner who is responsible for their case now. Its own template rather than
        // reusing the "somebody has it" one: the requester may have been talking to the
        // previous technician, and the mail has to name both ends of the handover.
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket->fresh(), 'forwarded', $staff->name));
        $this->emailOwner($ticket, 'ticket.owner_forwarded', [
            'ticket.assignee' => (string) $staff->name,
            'from.name' => $fromName ?: '-',
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

        // Tell the owner their case is finished, whichever way it ended. A cancellation used
        // to be bell-only, on the grounds that the reason showed in the drawer — but a case
        // closed without being fixed is the one outcome the requester most needs told, and
        // the reason now travels with the mail rather than waiting for them to go looking.
        $ticket = $ticket->fresh();
        $this->ownerUser($ticket)?->notify(new TicketOwnerNotification($ticket, $complete ? 'resolved' : 'cancelled'));
        $this->email->sendTemplate(
            $complete ? 'ticket.resolved' : 'ticket.cancelled',
            $this->ownerEmail($ticket),
            $this->ownerVars($ticket),
            $this->ownerUrl($ticket),
            'Open the ticket',
            $ticket->requester?->name,
        );

        return $ticket->fresh();
    }

    /**
     * Mails the case's requester, whatever the news is.
     *
     * Every requester-facing mail carries the same picture of the case (ownerVars) so they
     * read as one conversation about one ticket, plus whatever this particular step adds.
     *
     * @param  array<string, string>  $extraVars
     */
    private function emailOwner(Ticket $ticket, string $templateKey, array $extraVars = []): void
    {
        $ticket = $ticket->fresh();

        $this->email->sendTemplate(
            $templateKey,
            $this->ownerEmail($ticket),
            $extraVars + $this->ownerVars($ticket),
            $this->ownerUrl($ticket),
            'Open the ticket',
            $ticket->requester?->name,
        );
    }

    /**
     * Where a requester's mail sends them: their own list, with the case open.
     *
     * Not the All tab the staff mails use — a requester has no All tab, and landing on a
     * tab that is not theirs drops them on whatever the page shows first instead of the
     * case they were reading about.
     */
    private function ownerUrl(Ticket $ticket): string
    {
        return url("/tickets?tab=my&view={$ticket->id}");
    }

    /** Where a staff mail sends them: the All tab with the case open, as ticket.new_case does. */
    private function staffUrl(Ticket $ticket): string
    {
        return url("/tickets?tab=all&view={$ticket->id}");
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
    /**
     * Ticket fields for the staff-facing mail about a case.
     *
     * Carries who raised it — the requester needs no telling who they are, the person
     * deciding whether to pick the case up does. Deliberately WITHOUT user.first_name: this
     * mail goes to several people and each is greeted by their own name, so the caller adds
     * it. Reusing ownerVars() here would have greeted every IT staff as the requester.
     *
     * @return array<string, string>
     */
    private function staffVars(Ticket $ticket): array
    {
        return [
            'ticket.id' => (string) $ticket->ticket_no,
            'ticket.subject' => (string) $ticket->subject,
            'ticket.category' => $ticket->category?->label() ?? '-',
            'ticket.details' => nl2br(e((string) $ticket->description)),
            'ticket.requester' => (string) ($ticket->requester?->name ?? '-'),
        ];
    }

    private function ownerVars(Ticket $ticket): array
    {
        return [
            'user.first_name' => strtok((string) ($ticket->requester?->name ?? ''), ' '),
            'ticket.id' => (string) $ticket->ticket_no,
            'ticket.subject' => (string) $ticket->subject,
            'ticket.category' => $ticket->category?->label() ?? '-',
            // The only variable carrying free text the requester typed. It goes into an HTML
            // email, so it is escaped — otherwise a description containing a stray tag would
            // break the message, or worse — and its line breaks are turned into <br> so a
            // multi-line description does not arrive as one run-on paragraph.
            'ticket.details' => nl2br(e((string) $ticket->description)),
            // What IT wrote when they closed it — the fix on a completed case, the reason on
            // a cancelled one. Escaped and line-broken for the same reason as the details
            // above: it is free text somebody typed, and it goes into an HTML email.
            'ticket.resolution' => filled($ticket->resolution) ? nl2br(e((string) $ticket->resolution)) : '-',
            'reference.id' => (string) $ticket->ticket_no,
        ];
    }
}
