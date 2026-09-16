<?php

namespace App\Services\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Notifications\RequestWorkflowNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\EmailTable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Central send path for Request-module bell + email notifications, one method
 * per workflow transition (mirrors StockNotificationService). Every hop of the
 * draw.io flow notifies by Bell + Email:
 *
 *  submitted        → requester (receipt) + first approver (action needed)
 *  advanced         → requester (step passed, bell only) + next approver
 *  finalApproved    → requester + the requests.fulfill queue (ready_to_fulfill,
 *                     which names the auto-opened case when there is one)
 *  rejected         → requester, carrying the decision remark
 *  fulfilled        → requester
 *  cancelled        → the waiting approver's action bell is replaced
 */
class RequestNotificationService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Who hears what happens to this request: the person it is FOR, and — when
     * somebody else filed it — the person who filed it. Both, because onboarding is
     * an errand HR has to see finished while the new hire is the one who gets the
     * laptop.
     *
     * The owner's account is looked up through the employee, not just `user_id`: an
     * onboarding request is filed before that account exists, and resolving it live
     * means the day it is provisioned they start hearing about their own request.
     * When owner and filer are the same account (an ordinary submission) the list
     * collapses to one, so nobody is told twice.
     *
     * @return Collection<int, User>
     */
    private function followers(ServiceRequest $request): Collection
    {
        return collect([
            $request->user ?? $request->employee?->user,
            $request->origin?->isOnBehalf() ? $request->submittedBy : null,
        ])->filter()->unique('id')->values();
    }

    public function submitted(ServiceRequest $request): void
    {
        $current = $request->currentApproval();

        $followers = $this->followers($request);
        if ($followers->isNotEmpty()) {
            Notification::send($followers, new RequestWorkflowNotification($request, 'submitted', $current?->label));
            $this->emailEach($followers, 'request.submitted', $request, ['step.label' => $current?->label ?? 'IT Staff']);
        }

        if ($current !== null) {
            $this->notifyApprover($request, $current);
        }
    }

    /** An intermediate step was approved: tell the requester, poke the next approver. */
    public function advanced(ServiceRequest $request, RequestApproval $decided): void
    {
        $this->sendBell(
            $this->followers($request),
            new RequestWorkflowNotification($request, 'approved_step', $decided->label, $decided->acted_by_name),
            ['service_request_id' => $request->id, 'subtype' => 'approved_step'],
        );

        if ($next = $request->currentApproval()) {
            $this->notifyApprover($request, $next);
        }
    }

    /** Every approval step passed: requester + the fulfillment queue. */
    public function finalApproved(ServiceRequest $request): void
    {
        $followers = $this->followers($request);
        if ($followers->isNotEmpty()) {
            Notification::send($followers, new RequestWorkflowNotification($request, 'approved_final'));
            $this->emailEach($followers, 'request.approved', $request);
        }

        // Whoever follows the request has just been told it passed; the queue bell is
        // for the people who now have to act on it.
        //
        // Its own subtype, not the approvers' `waiting`: IT delivers, it does not decide,
        // and a workflow that opened its own case leaves nothing here to press at all —
        // closing that case is what fulfils the request. The bell names the case so it
        // reads as one story with the case's own "new case" bell instead of a second
        // approval step standing next to it.
        // Gated by notify_approved, not by fulfill: closing a request and wanting to hear
        // that one is ready are separate jobs, and the rota that does the closing changes.
        $queue = $this->recipients('requests.notify_approved')
            ->reject(fn (User $u) => $followers->contains('id', $u->id))
            ->values();
        $this->sendBell(
            $queue,
            new RequestWorkflowNotification($request, 'ready_to_fulfill'),
            ['service_request_id' => $request->id, 'subtype' => 'ready_to_fulfill'],
        );
        $this->emailEach($queue, 'request.ready_to_fulfill', $request);
    }

    public function rejected(ServiceRequest $request, RequestApproval $row): void
    {
        $followers = $this->followers($request);
        if ($followers->isNotEmpty()) {
            Notification::send($followers, new RequestWorkflowNotification(
                $request, 'rejected', $row->label, $row->acted_by_name, $row->note,
            ));
            $this->emailEach($followers, 'request.rejected', $request, [
                'actor.name' => $row->acted_by_name ?? $row->label,
                'remark' => $this->remark($row->note),
            ]);
        }
    }

    public function fulfilled(ServiceRequest $request): void
    {
        $followers = $this->followers($request);
        if ($followers->isNotEmpty()) {
            Notification::send($followers, new RequestWorkflowNotification($request, 'fulfilled'));
            $this->emailEach($followers, 'request.fulfilled', $request);
        }
    }

    /**
     * Approved, worked on, and then closed without delivery — the requester and whoever
     * filed it for them are told, with the reason IT gave.
     *
     * Separate from cancelled() below, which speaks to the approver who was still holding
     * a pending request. Nobody is holding this one: it cleared every step, so the
     * fulfilment row belongs to the IT queue and carries no person at all. Routed here it
     * reached nobody, which is how a request could be closed in silence.
     */
    public function notDelivered(ServiceRequest $request, ?string $reason): void
    {
        $followers = $this->followers($request);
        if ($followers->isEmpty()) {
            return;
        }

        Notification::send($followers, new RequestWorkflowNotification($request, 'cancelled', null, null, $reason));
        // actor.name is "who decided this" in every request mail — the rejecting approver in
        // request.rejected, and here the IT staff who closed the case out.
        $this->emailEach($followers, 'request.not_delivered', $request, [
            'actor.name' => $this->fulfilledBy($request),
            'remark' => $this->remark($reason),
        ]);
    }

    /** Replace the waiting approver's action bell with a cancellation notice. */
    public function cancelled(ServiceRequest $request, ?RequestApproval $wasCurrent): void
    {
        $approver = $this->approverUser($wasCurrent);
        if ($approver === null) {
            return;
        }

        $this->sendBell(
            collect([$approver]),
            new RequestWorkflowNotification($request, 'cancelled', $wasCurrent?->label, $request->requester_name),
            ['service_request_id' => $request->id],
        );
    }

    /** Bell + email one resolved approver that a step waits on them. */
    private function notifyApprover(ServiceRequest $request, RequestApproval $row): void
    {
        $approver = $this->approverUser($row);
        if ($approver === null) {
            // it_staff queue rows carry no person and are notified at finalApproved.
            // A row that DOES name a person but has no account behind it is a request
            // stuck where nobody can act — tell whoever can create that account.
            if ($row->approver_employee_id !== null) {
                $this->notifyCredentialSettersOfBlock($request, $row);
            }

            return;
        }

        $this->sendBell(
            collect([$approver]),
            new RequestWorkflowNotification($request, 'waiting', $row->label, $request->requester_name),
            ['service_request_id' => $request->id, 'subtype' => 'waiting'],
        );
        $this->emailEach(collect([$approver]), 'request.approval_needed', $request, ['step.label' => $row->label]);
    }

    /**
     * Delivers the "awaiting your decision" bells this employee never received because
     * they had no account when the step reached them.
     *
     * Notifications are pushed at the moment of the event and nothing replays them, so
     * an approval that landed before the account existed stayed invisible: the sidebar
     * counted it, but the person had nothing telling them to look. Called the instant an
     * account is provisioned — the first moment there is an inbox to deliver to.
     *
     * @return int how many were delivered
     */
    public function deliverPendingApprovals(Employee $employee): int
    {
        $rows = RequestApproval::with('request')
            ->where('approver_employee_id', $employee->id)
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value)
            ->get()
            ->filter(fn (RequestApproval $row) => $row->request !== null);

        foreach ($rows as $row) {
            $this->notifyApprover($row->request, $row);
        }

        return $rows->count();
    }

    /**
     * The request waits on somebody who cannot sign in yet. Nobody involved can move
     * it, and the approver has no inbox to be told about it — so the bell goes to the
     * people who hold employees.set_credentials, pointing at the person to provision.
     *
     * Without this the request simply sits there: the approver learns of it only when
     * an account happens to be created, and no one else learns of it at all.
     */
    private function notifyCredentialSettersOfBlock(ServiceRequest $request, RequestApproval $row): void
    {
        $employee = $row->approver;
        if ($employee === null) {
            return;
        }

        $setters = $this->recipients('employees.set_credentials');
        if ($setters->isEmpty()) {
            return;
        }

        $this->sendBell(
            $setters,
            new RequestWorkflowNotification($request, 'blocked_no_account', $row->label, $row->approver_name, null, $employee),
            ['service_request_id' => $request->id, 'subtype' => 'blocked_no_account'],
        );
    }

    /** The login account behind an approval row, or null for queue/skipped rows. */
    private function approverUser(?RequestApproval $row): ?User
    {
        if ($row === null || $row->approver_employee_id === null) {
            return null;
        }

        return User::where('employee_id', $row->approver_employee_id)->first();
    }

    /**
     * Users whose role grants the given permission (super included).
     *
     * @return Collection<int, User>
     */
    private function recipients(string $permission): Collection
    {
        return User::all()->filter(fn (User $u) => $u->hasPermission($permission))->values();
    }

    /**
     * Clear each recipient's existing matching bell, then resend so it
     * re-surfaces unread instead of piling up.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $dataMatch
     */
    private function sendBell(Collection $recipients, RequestWorkflowNotification $notification, array $dataMatch): void
    {
        foreach ($recipients as $recipient) {
            $query = $recipient->notifications()->where('type', RequestWorkflowNotification::class);
            foreach ($dataMatch as $key => $value) {
                $query->where("data->{$key}", $value);
            }
            $query->delete();
        }

        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, $notification);
        }
    }

    /**
     * Queue a templated email to each recipient with an address.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $extraVars
     */
    private function emailEach(Collection $recipients, string $templateKey, ServiceRequest $request, array $extraVars = []): void
    {
        foreach ($recipients as $recipient) {
            $this->emailUser($recipient, $templateKey, $request, $extraVars);
        }
    }

    /** @param array<string, mixed> $extraVars */
    /**
     * What the requester actually asked for — the fields the wizard collected for this
     * service, already resolved to display labels and values when the request was saved.
     *
     * Without it the mail names a type and a reason but not the thing itself: "Computer for
     * Somchai", with no way to tell a desktop from a laptop until somebody opens the portal.
     */
    private function detailLines(ServiceRequest $request): string
    {
        $display = (array) data_get($request->fields, '_display', []);

        $lines = collect($display)
            ->map(fn (array $field) => e((string) ($field['label_en'] ?? $field['key'] ?? '')).': '
                .e((string) ($field['value'] ?? '-')))
            ->filter()
            ->implode('<br>');

        return $lines !== '' ? $lines : '-';
    }

    /**
     * A remark somebody typed, made safe for the message it goes into.
     *
     * Rejecting requires a reason and not delivering asks for one, so this is the free text
     * most likely to reach a recipient — and it was going in raw. A note containing a stray
     * angle bracket broke the message; one containing a tag was rendered as that tag. The
     * line breaks are kept, because a reason written over three lines is written that way
     * on purpose.
     */
    private function remark(?string $note): string
    {
        return filled($note) ? nl2br(e(trim($note))) : '-';
    }

    /**
     * The IT staff who closed the request out.
     *
     * Kept on the fulfilment row rather than the request: service_requests records WHEN it
     * was fulfilled but never who did it, and that row is the only place the name lands.
     */
    private function fulfilledBy(ServiceRequest $request): string
    {
        $row = $request->approvals()
            ->where('kind', WorkflowStepKind::Fulfillment->value)
            ->orderByDesc('position')
            ->first();

        return (string) ($row?->acted_by_name ?: '-');
    }

    /** The shape of the approval-history table — shared so the preview matches the mail. */
    public const HISTORY_HEADERS = ['Step', 'Decision', 'By', 'Date'];

    public const HISTORY_WIDTHS = ['30%', '26%', '26%', '18%'];

    /**
     * Why a step was skipped, in the same words the Requests screen uses (req_skip_*).
     *
     * Kept here rather than read from the SPA dictionary: this runs with no reader and no
     * language to render in, and the codes are a snapshot fact while the wording is
     * presentation. Two copies of a sentence is the cost of a mail that can explain itself.
     */
    public const SKIP_REASONS = [
        'no_manager' => 'Skipped - the requester has no manager',
        'no_matching_position' => 'Skipped - nobody above the requester holds this position',
        'no_resource_owner' => 'Skipped - this resource has no owner',
        'requester_is_owner' => 'Skipped - the requester owns this resource',
    ];

    /**
     * What has already happened on this request, as a table.
     *
     * An approver three steps down opens the mail knowing only that it is their turn. Whether
     * two people already said yes, or every step before them was skipped and they are in fact
     * the first human to look at it, changes how much weight their own signature carries —
     * and it was not written anywhere they could see without opening the portal.
     *
     * Only the rows BEFORE the one being waited on, and only approval steps: the fulfilment
     * row is IT's work queue, not a decision anybody made.
     */
    private function approvalHistory(ServiceRequest $request): string
    {
        $current = $request->currentApproval();

        $decided = $request->approvals()
            ->orderBy('position')
            ->get()
            ->filter(fn (RequestApproval $row) => $row->kind === WorkflowStepKind::Approval)
            ->filter(fn (RequestApproval $row) => $current === null || $row->position < $current->position)
            ->filter(fn (RequestApproval $row) => in_array($row->status, [ApprovalStatus::Approved, ApprovalStatus::Skipped], true));

        if ($decided->isEmpty()) {
            return '<p style="color:#64748b;font-size:14px;margin:12px 0;">You are the first approver on this request.</p>';
        }

        $rows = $decided->map(function (RequestApproval $row) {
            $skipped = $row->status === ApprovalStatus::Skipped;

            return [
                EmailTable::text((string) $row->label, 34),
                // The mark is added here, not stored in SKIP_REASONS: that constant is the
                // wording the Requests screen also uses, and the screen has its own status
                // colours. Decoration belongs to whichever surface is drawing.
                ($skipped ? '⏭️ ' : '✅ ').EmailTable::text($skipped
                    ? (self::SKIP_REASONS[$row->skip_reason?->value] ?? 'Skipped')
                    : 'Approved', 60),
                EmailTable::text($skipped ? '-' : (string) ($row->acted_by_name ?: $row->approver_name ?: '-'), 30),
                $row->acted_at?->format('d-m-Y') ?? '-',
            ];
        })->values()->all();

        return EmailTable::render(self::HISTORY_HEADERS, $rows, [], self::HISTORY_WIDTHS, [1]);
    }

    /**
     * Who the request is sitting with right now, and where they sit in the company.
     *
     * Deliberately approver.* and not user.*: throughout these templates user.* means the
     * PERSON READING the mail, and naming the approver's position user.position would put
     * two different people behind one prefix.
     *
     * Empty on a request that has cleared every step or has none — a finished request has no
     * next approver, and a label with nothing after it reads better as a dash than as a lie.
     *
     * @return array<string, string>
     */
    private function approverVars(ServiceRequest $request): array
    {
        $row = $request->currentApproval();
        $employee = $row?->approver_employee_id !== null
            ? Employee::with(['position', 'department'])->find($row->approver_employee_id)
            : null;

        return [
            'approver.name' => (string) ($row?->approver_name ?: '-'),
            'approver.position' => (string) ($employee?->position?->title ?: '-'),
            // Master data is mixed-language; the English name is the one always filled.
            'approver.department' => (string) ($employee?->department?->name ?: $employee?->department?->name_th ?: '-'),
        ];
    }

    private function emailUser(User $recipient, string $templateKey, ServiceRequest $request, array $extraVars = []): void
    {
        $this->email->sendTemplate($templateKey, $recipient->email, $extraVars + [
            'user.first_name' => explode(' ', (string) $recipient->name)[0] ?: 'there',
            // An approver reading this in their inbox needs to know it is a new hire
            // before they open anything, and the templates carry no origin field.
            'request.title' => $request->origin?->isOnBehalf()
                ? '[New employee] '.$request->title
                : $request->title,
            'request.type' => $request->type?->label(),
            'requester.name' => $request->requester_name,
            'reference.id' => $request->reference,
            'request.date' => $request->created_at?->format('d-m-Y') ?? '-',
            // Stamped when the LAST approval step passes, so it is empty until then.
            'request.approved_date' => $request->approved_at?->format('d-m-Y') ?? '-',
            'request.rejected_date' => $request->rejected_at?->format('d-m-Y') ?? '-',
            // Withdrawn by the requester, or approved and then cancelled by IT — the second
            // is the one that sends mail (request.not_delivered).
            'request.cancelled_date' => $request->cancelled_at?->format('d-m-Y') ?? '-',
            // Set by finalize() before this mail is composed, and only for workflows with
            // auto_ticket on — the others have nothing to open.
            'request.ticket_no' => (string) ($request->ticket?->ticket_no ?: '-'),
            'request.fulfilled_date' => $request->fulfilled_at?->format('d-m-Y') ?? '-',
            'request.fulfilled_by' => $this->fulfilledBy($request),
            // Free text somebody typed, landing in an HTML email.
            'request.reason' => filled($request->reason) ? nl2br(e((string) $request->reason)) : '-',
            'request.details' => $this->detailLines($request),
            'request.approval_history' => $this->approvalHistory($request),
            ...$this->approverVars($request),
        ], $this->requestUrl($request), 'View request', $recipient->name);
    }

    /**
     * Bell-only reminder that a step has been sitting with this approver. No mail: the
     * "awaiting your approval" mail already went out when the step arrived, and repeating
     * it daily teaches people to filter the address rather than to act.
     *
     * `sendBell` clears the matching bell before resending, so a request reminded every
     * morning stays one unread bell rather than a stack of identical ones.
     */
    public function remindApprover(ServiceRequest $request, RequestApproval $row, int $days): void
    {
        $approver = $this->approverUser($row);
        if ($approver === null) {
            return;
        }

        $this->sendBell(
            collect([$approver]),
            new RequestWorkflowNotification($request, 'stalled', $row->label, $request->requester_name, null, null, $days),
            ['service_request_id' => $request->id, 'subtype' => 'stalled'],
        );
    }

    /**
     * The same reminder for a rung that names no person — the IT queue. It goes to whoever
     * asked to hear about requests that reached fulfilment, since there is no individual
     * holding the step to poke.
     */
    public function remindQueue(ServiceRequest $request, RequestApproval $row, int $days): void
    {
        $this->sendBell(
            $this->recipients('requests.notify_approved'),
            new RequestWorkflowNotification($request, 'stalled', $row->label, $request->requester_name, null, null, $days),
            ['service_request_id' => $request->id, 'subtype' => 'stalled'],
        );
    }

    /**
     * One weekly mail per person listing every approval they have left sitting, rather than
     * one mail per request: five reminders in an inbox on a Monday morning are five things
     * to dismiss, while one list is a piece of work.
     *
     * The table is rendered here and passed in as a single variable, so the template stays
     * something an administrator can reword without hand-writing HTML rows.
     *
     * @param  Collection<int, array{request: ServiceRequest, days: int}>  $items
     */
    public function stalledDigest(User $recipient, Collection $items): void
    {
        if ($items->isEmpty()) {
            return;
        }

        $this->email->sendTemplate('request.stalled_digest', $recipient->email, [
            'user.first_name' => explode(' ', (string) $recipient->name)[0] ?: 'there',
            'digest.count' => (string) $items->count(),
            'digest.table' => $this->digestTable($items),
        ], rtrim((string) config('app.url'), '/').'/requests?tab=mine', 'Open my approvals', $recipient->name);
    }

    /**
     * The digest's table: reference (linked to the request), what it is, who asked, and how
     * long it has waited — longest first, because that is the order they should be cleared in.
     *
     * Inline styles only: mail clients drop <style> blocks, and this HTML is handed to the
     * same template the administrator edits.
     *
     * @param  Collection<int, array{request: ServiceRequest, days: int}>  $items
     */
    private function digestTable(Collection $items): string
    {
        $rows = $items
            ->sortByDesc('days')
            ->map(function (array $item) {
                $request = $item['request'];

                return [
                    EmailTable::link($this->requestUrl($request), $request->reference),
                    EmailTable::text((string) $request->title),
                    EmailTable::text((string) ($request->requester_name ?? '-'), 32),
                    (string) $item['days'],
                ];
            })
            ->values()
            ->all();

        return EmailTable::render(
            ['Reference', 'Request', 'Requested by', 'Days waiting'],
            $rows,
            [3],
            ['18%', '40%', '26%', '16%'],
        );
    }

    /** Absolute SPA deep link to one request. The SPA gates it behind login. */
    private function requestUrl(ServiceRequest $request): string
    {
        return rtrim((string) config('app.url'), '/')."/requests?view={$request->id}";
    }
}
