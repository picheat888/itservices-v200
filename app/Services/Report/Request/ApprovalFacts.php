<?php

namespace App\Services\Report\Request;

use App\Models\Employee\Department;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The approval steps behind "การอนุมัติคำขอ" (requests.approvals), read in whole days:
 * who a step is on, how long it took, and whether anybody can still act on it.
 */
final class ApprovalFacts
{
    use RequestLabels;

    /**
     * Approval steps and IT's not-delivered steps that matter between `since` and `to`, plus every step waiting now.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, RequestApproval>
     */
    public static function steps(array $filters, Carbon $since, Carbon $to): Collection
    {
        return RequestApproval::query()
            ->with([
                'request:id,reference,type,status,employee_id,requester_name,department_name,email_group_id,file_share_id,created_at,rejected_at,cancelled_at,cancel_reason,cancelled_by_name',
                'request.employee:id,code,first_name,last_name,status,manager_id',
                'approver:id,code,first_name,last_name,status,last_day,department_id', 'approver.department:id,name,name_th', 'approver.user:id,employee_id',
                'actedBy:id,employee_id', 'actedBy.employee:id,code,department_id', 'actedBy.employee.department:id,name,name_th',
            ])
            ->where(fn (Builder $q) => $q->where('kind', 'approval')
                ->orWhere(fn (Builder $c) => $c->where('kind', 'completion')->where('status', 'rejected')))
            ->whereHas('request', fn (Builder $r) => self::scopeRequests($r, $filters))
            ->where(fn (Builder $q) => $q->whereBetween('became_current_at', [$since, $to])
                ->orWhere('status', 'current')
                ->orWhereHas('request', fn (Builder $r) => $r->whereBetween('created_at', [$since, $to])
                    ->orWhereBetween('rejected_at', [$since, $to])
                    ->orWhereBetween('cancelled_at', [$since, $to])))
            ->orderBy('id')
            ->get();
    }

    /**
     * Requests of the chosen type and of the requester's department (the request's own record when the employee is gone).
     *
     * @param  array<string, mixed>  $filters
     */
    public static function scopeRequests(Builder $query, array $filters): Builder
    {
        $departmentId = ($filters['department_id'] ?? null) ? (int) $filters['department_id'] : null;
        $departmentName = $departmentId ? Department::query()->whereKey($departmentId)->value('name') : null;

        return $query
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($departmentId, fn (Builder $q) => $q->where(fn (Builder $d) => $d
                ->whereHas('employee', fn (Builder $e) => $e->where('department_id', $departmentId))
                ->orWhere(fn (Builder $n) => $n->whereDoesntHave('employee')->where('department_name', $departmentName))));
    }

    /** @var \WeakMap<RequestApproval, array<string, mixed>>|null */
    private static ?\WeakMap $memo = null;

    // One answer per step per request: the report asks the same question of a step many times
    private static function once(RequestApproval $step, string $name, callable $compute): mixed
    {
        self::$memo ??= new \WeakMap;
        $slot = self::$memo[$step] ?? [];
        if (! array_key_exists($name, $slot)) {
            $slot[$name] = $compute();
            self::$memo[$step] = $slot;
        }

        return $slot[$name];
    }

    /** Who a step is on: whoever decided it, else the named approver holding it, else the step's own label. */
    public static function key(RequestApproval $step): string
    {
        return self::once($step, 'key', fn () => (string) ($step->acted_by_name ?? $step->approver_name ?? $step->label));
    }

    public static function isApproval(RequestApproval $step): bool
    {
        return $step->kind->value === 'approval';
    }

    /** Whole days a step took: to its decision, to the withdrawal that ended its wait, or to today while it waits. */
    public static function days(RequestApproval $step): ?int
    {
        return self::once($step, 'days', function () use ($step) {
            if ($step->became_current_at === null) {
                return null;
            }
            $end = $step->acted_at
                ?? ($step->status->value === 'waiting' ? $step->request?->cancelled_at : null)
                ?? now();

            return max(0, self::wholeDays($step->became_current_at, $end));
        });
    }

    /** A step still holding a pending request. */
    public static function isWaiting(RequestApproval $step): bool
    {
        return self::once($step, 'waiting', fn () => self::isApproval($step) && $step->status->value === 'current' && $step->request?->status->value === 'pending');
    }

    /** Why nobody can act on a waiting step — its named approver has left, or has no login — or null. */
    public static function blockedBecause(RequestApproval $step): ?string
    {
        return self::once($step, 'blocked', fn () => self::computeBlocked($step));
    }

    private static function computeBlocked(RequestApproval $step): ?string
    {
        if ($step->approver_employee_id === null || $step->approver === null) {
            return null;
        }
        if ($step->approver->hasLeft()) {
            return 'left';
        }

        return $step->approver->user === null ? 'no_account' : null;
    }

    /**
     * The person cell, of whoever decided, else of the named approver; a department step nobody took is a group step.
     *
     * @return array{name: string, code: ?string, department: array{name: string, name_th: ?string}|null, kind: string}
     */
    public static function person(RequestApproval $step): array
    {
        return self::once($step, 'person', fn () => self::computePerson($step));
    }

    /** @return array{name: string, code: ?string, department: array{name: string, name_th: ?string}|null, kind: string} */
    private static function computePerson(RequestApproval $step): array
    {
        $employee = $step->acted_by_user_id !== null ? $step->actedBy?->employee : $step->approver;
        $kind = match (true) {
            $employee !== null => 'person',
            $step->acted_by_user_id !== null || $step->acted_by_name !== null => 'unlinked_account',
            default => 'group_step',
        };

        return [
            'name' => self::key($step),
            'code' => $employee?->code,
            'department' => $employee?->department ? ['name' => $employee->department->name, 'name_th' => $employee->department->name_th] : null,
            'kind' => $kind,
        ];
    }

    /**
     * Approval steps that reached somebody in the range and were decided, or still hold a pending request.
     *
     * @param  Collection<int, RequestApproval>  $steps
     * @return Collection<int, RequestApproval>
     */
    public static function reached(Collection $steps, Carbon $from, Carbon $to, ?string $approver): Collection
    {
        return $steps->filter(fn (RequestApproval $s) => self::isApproval($s)
            && $s->became_current_at?->between($from, $to)
            && (in_array($s->status->value, ['approved', 'rejected'], true) || self::isWaiting($s))
            && ($approver === null || self::key($s) === $approver))->values();
    }

    /**
     * Steps waiting now, whenever they reached the approver.
     *
     * @param  Collection<int, RequestApproval>  $steps
     * @return Collection<int, RequestApproval>
     */
    public static function waitingNow(Collection $steps, ?string $approver): Collection
    {
        return $steps->filter(fn (RequestApproval $s) => self::isWaiting($s) && ($approver === null || self::key($s) === $approver))->values();
    }

    /**
     * Requests that ended without delivery in the range, newest first: rejected, withdrawn while waiting, or not delivered by IT.
     *
     * @param  Collection<int, RequestApproval>  $steps
     * @return list<array{request: ServiceRequest, outcome: string, step: RequestApproval, by: ?string, reason: ?string, at: Carbon}>
     */
    public static function endings(Collection $steps, Carbon $from, Carbon $to, ?string $approver): array
    {
        $out = [];
        foreach ($steps->groupBy('service_request_id') as $own) {
            /** @var ServiceRequest $request */
            $request = $own->first()->request;
            $status = $request->status->value;
            if ($status === 'rejected' && $request->rejected_at?->between($from, $to)) {
                $step = $own->first(fn (RequestApproval $s) => self::isApproval($s) && $s->status->value === 'rejected');
                if ($step !== null) {
                    $out[] = ['request' => $request, 'outcome' => 'rejected', 'step' => $step, 'by' => self::key($step), 'reason' => $step->note, 'at' => $request->rejected_at, 'match' => self::key($step)];
                }
            }
            if ($status === 'cancelled' && $request->cancelled_at?->between($from, $to)) {
                $closed = $own->first(fn (RequestApproval $s) => ! self::isApproval($s));
                if ($closed !== null) {
                    $out[] = ['request' => $request, 'outcome' => 'not_delivered', 'step' => $closed, 'by' => self::key($closed), 'reason' => $closed->note, 'at' => $request->cancelled_at, 'match' => self::key($closed)];

                    continue;
                }
                // The step the requester stopped waiting on goes back to "waiting" and keeps its clock.
                $stood = $own->filter(fn (RequestApproval $s) => self::isApproval($s) && $s->status->value === 'waiting' && $s->became_current_at !== null)
                    ->sortByDesc('position')->first();
                if ($stood !== null) {
                    $out[] = ['request' => $request, 'outcome' => 'withdrawn', 'step' => $stood, 'by' => $request->cancelled_by_name, 'reason' => $request->cancel_reason, 'at' => $request->cancelled_at, 'match' => self::key($stood)];
                }
            }
        }

        $out = array_values(array_filter($out, fn (array $e) => $approver === null || $e['match'] === $approver));
        usort($out, fn (array $a, array $b) => [$b['at']->getTimestamp(), $b['request']->id] <=> [$a['at']->getTimestamp(), $a['request']->id]);

        return array_map(fn (array $e) => array_diff_key($e, ['match' => true]), $out);
    }

    /**
     * Steps skipped at submit on requests filed in the range.
     *
     * @param  Collection<int, RequestApproval>  $steps
     * @return Collection<int, RequestApproval>
     */
    public static function skipped(Collection $steps, Carbon $from, Carbon $to): Collection
    {
        return $steps->filter(fn (RequestApproval $s) => $s->status->value === 'skipped' && $s->request?->created_at?->between($from, $to))->values();
    }

    /**
     * How many of these requests had every approval step skipped.
     *
     * @param  Collection<int, RequestApproval>  $all
     * @param  list<int>  $requestIds
     */
    public static function unapproved(Collection $all, array $requestIds): int
    {
        $byRequest = $all->filter(fn (RequestApproval $s) => self::isApproval($s))->groupBy('service_request_id');

        return count(array_filter($requestIds, fn (int $id) => $byRequest->get($id, collect())
            ->every(fn (RequestApproval $s) => $s->status->value === 'skipped')));
    }

    /** Mean of whole days, one decimal; null when there is nothing to average. */
    public static function average(Collection $steps): ?float
    {
        $days = $steps->map(fn (RequestApproval $s) => self::days($s))->filter(fn (?int $d) => $d !== null);

        return $days->isEmpty() ? null : round($days->avg(), 1);
    }
}
