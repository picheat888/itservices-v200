<?php

namespace App\Services\Request;

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

    public function submitted(ServiceRequest $request): void
    {
        $current = $request->currentApproval();

        if ($owner = $request->user) {
            Notification::send($owner, new RequestWorkflowNotification($request, 'submitted', $current?->label));
            $this->emailUser($owner, 'request.submitted', $request, ['step.label' => $current?->label ?? 'IT Staff']);
        }

        if ($current !== null) {
            $this->notifyApprover($request, $current);
        }
    }

    /** An intermediate step was approved: tell the requester, poke the next approver. */
    public function advanced(ServiceRequest $request, RequestApproval $decided): void
    {
        if ($owner = $request->user) {
            $this->sendBell(
                collect([$owner]),
                new RequestWorkflowNotification($request, 'approved_step', $decided->label, $decided->acted_by_name),
                ['service_request_id' => $request->id, 'subtype' => 'approved_step'],
            );
        }

        if ($next = $request->currentApproval()) {
            $this->notifyApprover($request, $next);
        }
    }

    /** Every approval step passed: requester + the fulfillment queue. */
    public function finalApproved(ServiceRequest $request): void
    {
        if ($owner = $request->user) {
            Notification::send($owner, new RequestWorkflowNotification($request, 'approved_final'));
            $this->emailUser($owner, 'request.approved', $request);
        }

        $queue = $this->recipients('requests.fulfill')
            ->reject(fn (User $u) => $u->id === $request->user_id)
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
        if ($owner = $request->user) {
            Notification::send($owner, new RequestWorkflowNotification(
                $request, 'rejected', $row->label, $row->acted_by_name, $row->note,
            ));
            $this->emailUser($owner, 'request.rejected', $request, [
                'actor.name' => $row->acted_by_name ?? $row->label,
                'remark' => $row->note ?? '—',
            ]);
        }
    }

    public function fulfilled(ServiceRequest $request): void
    {
        if ($owner = $request->user) {
            Notification::send($owner, new RequestWorkflowNotification($request, 'fulfilled'));
            $this->emailUser($owner, 'request.fulfilled', $request);
        }
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
            return; // it_staff queue rows are notified at finalApproved instead
        }

        $this->sendBell(
            collect([$approver]),
            new RequestWorkflowNotification($request, 'waiting', $row->label, $request->requester_name),
            ['service_request_id' => $request->id, 'subtype' => 'waiting'],
        );
        $this->emailEach(collect([$approver]), 'request.approval_needed', $request, ['step.label' => $row->label]);
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
            'request.title' => $request->title,
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
