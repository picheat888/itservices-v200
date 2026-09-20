<?php

namespace App\Services\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Request\RequestApproval;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Finds approval steps that have been sitting with somebody and says so — the only part of
 * the Request module that speaks without an event happening.
 *
 * Every other notification is pushed the moment something changes, and nothing replays it.
 * An approver who did not look at the bell that morning has nothing telling them again, so a
 * request can wait for weeks while the system considers itself finished with the matter.
 *
 * Two sweeps, deliberately different in shape:
 *
 *  - a daily bell to the person holding the step (3 days) — a nudge inside the app
 *  - a weekly mail per person (7 days), one list rather than one mail per request
 *
 * Neither is a deadline. There is no due date in the database and no "overdue" anywhere on
 * screen: SLA columns were dropped in August because nobody set them from experience. These
 * numbers say "long enough to be worth mentioning", which is a different claim.
 */
class RequestStalledService
{
    /** Days a step may sit before the daily bell starts mentioning it. */
    private const NUDGE_AFTER_DAYS = 3;

    /** Days a step may sit before it appears in the Monday digest. */
    private const DIGEST_AFTER_DAYS = 7;

    public function __construct(private readonly RequestNotificationService $notifications) {}

    /**
     * Daily bells for steps waiting longer than NUDGE_AFTER_DAYS.
     *
     * @return array{approvers: int, queue: int} how many bells each path sent
     */
    public function nudge(): array
    {
        $sent = ['approvers' => 0, 'queue' => 0];

        foreach ($this->stalledRows(self::NUDGE_AFTER_DAYS) as $row) {
            $days = $this->daysWaiting($row);

            // A step open to a group carries no single approver either, but it is not the
            // queue: everybody who could sign it is reminded.
            if ($row->isOpenToGroup()) {
                $this->notifications->remindApprover($row->request, $row, $days);
                $sent['approvers']++;

                continue;
            }

            // A rung naming nobody is the IT queue; there is no individual to poke, so the
            // people who asked to hear about fulfilment hear about this too.
            if ($row->approver_employee_id === null) {
                $this->notifications->remindQueue($row->request, $row, $days);
                $sent['queue']++;

                continue;
            }

            // An approver without a login gets nothing, by decision: a request waiting on
            // somebody who cannot sign in stays waiting, and the bell it would have sent
            // has nowhere to go.
            $this->notifications->remindApprover($row->request, $row, $days);
            $sent['approvers']++;
        }

        return $sent;
    }

    /**
     * The weekly digest: one mail per person, listing their own steps older than
     * DIGEST_AFTER_DAYS. Only people holding requests.notify_stalled receive it — the daily
     * bell is what everybody gets, and mail is opt-in through the Permissions screen.
     *
     * @return array{recipients: int, requests: int}
     */
    public function digest(): array
    {
        $rows = $this->stalledRows(self::DIGEST_AFTER_DAYS)
            ->filter(fn (RequestApproval $row) => $row->approver_employee_id !== null);

        $byEmployee = $rows->groupBy('approver_employee_id');
        if ($byEmployee->isEmpty()) {
            return ['recipients' => 0, 'requests' => 0];
        }

        $users = User::whereIn('employee_id', $byEmployee->keys())->get();

        $sent = ['recipients' => 0, 'requests' => 0];
        foreach ($users as $user) {
            if (! $user->hasPermission('requests.notify_stalled')) {
                continue;
            }

            $items = $byEmployee->get($user->employee_id, collect())
                ->map(fn (RequestApproval $row) => [
                    'request' => $row->request,
                    'days' => $this->daysWaiting($row),
                ]);

            if ($items->isEmpty()) {
                continue;
            }

            $this->notifications->stalledDigest($user, $items);
            $sent['recipients']++;
            $sent['requests'] += $items->count();
        }

        return $sent;
    }

    /**
     * Rungs still holding a live request, untouched for longer than the given number of days.
     *
     * Both halves of "stalled" are checked: the rung is `current` AND its request is still
     * open. A row can be left current on a request that was cancelled elsewhere, and
     * reminding anybody about that would be worse than saying nothing.
     *
     * The two kinds sit at different request statuses — an approval rung waits while the
     * request is `pending`, the IT queue while it is `approved` — so both are allowed here
     * and the kind of the rung, not the status, decides who is told.
     *
     * @return Collection<int, RequestApproval>
     */
    private function stalledRows(int $days): Collection
    {
        $live = [RequestStatus::Pending, RequestStatus::Approved];

        return RequestApproval::with(['request'])
            ->where('status', ApprovalStatus::Current->value)
            ->whereIn('kind', [WorkflowStepKind::Approval->value, WorkflowStepKind::Fulfillment->value])
            ->whereNotNull('became_current_at')
            ->where('became_current_at', '<=', now()->subDays($days))
            ->get()
            ->filter(fn (RequestApproval $row) => in_array($row->request?->status, $live, true))
            ->values();
    }

    /** Whole days the rung has been current, rounded down — what the reminder quotes. */
    private function daysWaiting(RequestApproval $row): int
    {
        return (int) $row->became_current_at->diffInDays(now());
    }
}
