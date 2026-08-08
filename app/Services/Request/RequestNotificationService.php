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
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Central send path for Request-module bell + email notifications, one method
 * per workflow transition (mirrors StockNotificationService). Every hop of the
 * draw.io flow notifies by Bell + Email:
 *
 *  submitted        → requester (receipt) + first approver (action needed)
 *  advanced         → requester (step passed, bell only) + next approver
 *  finalApproved    → requester + the requests.fulfill queue
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
        $queue = $this->recipients('requests.fulfill')
            ->reject(fn (User $u) => $followers->contains('id', $u->id))
            ->values();
        $this->sendBell(
            $queue,
            new RequestWorkflowNotification($request, 'waiting', 'IT Staff'),
            ['service_request_id' => $request->id, 'subtype' => 'waiting'],
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
                'remark' => $row->note ?? '—',
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
        $this->emailEach($followers, 'request.not_delivered', $request, ['remark' => $reason ?? '—']);
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
    private function emailUser(User $recipient, string $templateKey, ServiceRequest $request, array $extraVars = []): void
    {
        if (! $recipient->email) {
            return;
        }

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
        ], $this->requestUrl($request), 'View request');
    }

    /** Absolute SPA deep link to one request. The SPA gates it behind login. */
    private function requestUrl(ServiceRequest $request): string
    {
        return rtrim((string) config('app.url'), '/')."/requests?view={$request->id}";
    }
}
