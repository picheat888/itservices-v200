<?php

// The request list behind GET /service-requests: who sees what, tab scopes, filters, sort, and the KPI meta.

namespace App\Services\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Support\OverviewPeriod;
use App\Support\SearchTerms;
use Closure;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class RequestListService
{
    public function __construct(private readonly RequestPeriodStats $periodStats) {}

    /**
     * One page of the list; the KPI meta is built later by meta() so the overview period is read after the page.
     *
     * @param  array{sort: mixed, status: mixed, type: mixed, filed_from: ?string, filed_to: ?string, filed_days: ?int, search: mixed, scope: mixed, per_page: int}  $filters
     */
    public function page(User $viewer, array $filters): LengthAwarePaginator
    {
        $employeeId = $viewer->employee_id;
        // The employee record: a group step matches on department and position as well as name
        $employee = $viewer->employee;
        $canComplete = $this->canComplete($viewer);

        // Actionable first, newest within each group; approver.user and ticket.assignee avoid a query per row
        $query = $this->visibleTo($viewer)(ServiceRequest::with([...self::approvalsWithParent(), 'approvals.approver.user', 'approvals.actedBy.employee', 'ticket.assignee.employee', 'employee.position', 'employee.department']));
        // Both orders end on the id so server-side pages never repeat or drop a row
        match ($filters['sort']) {
            'activity' => $query->orderByDesc('last_activity_at')->latest('id'),
            // Overview "waiting on you" card: longest-waiting first
            'oldest' => $query->oldest()->oldest('id'),
            default => $query
                ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'completed' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END")
                ->latest()
                ->latest('id'),
        };

        if ($status = $filters['status']) {
            $query->where('status', $status);
        }
        if ($type = $filters['type']) {
            $query->where('type', $type);
        }
        $this->applyFiled($query, $filters);
        // Each word also matches the service name in either language through the type
        SearchTerms::apply($query, $filters['search'], [
            'reference', 'title', 'requester_name', 'department_name',
            SearchTerms::related('employee', ['code', ...SearchTerms::personName(), SearchTerms::related('department', ['name', 'name_th'])]),
            function ($q, string $like, string $word) {
                if ($types = RequestType::matching($word)) {
                    $q->orWhereIn('type', $types);
                }
            },
        ]);
        // Tab scopes: awaiting my decision / the IT completion queue / only my own
        if ($filters['scope'] === 'approvals') {
            // No employee record means nobody's approver: an empty tab, not the whole list
            $employeeId === null
                ? $query->whereIn('id', [])
                : $query->whereHas('approvals', fn ($a) => $a
                    ->actionableBy($employee)
                    ->where('status', ApprovalStatus::Current->value)
                    // Completion steps live in the queue tab; awaiting_me and the badge count approval steps only
                    ->where('kind', WorkflowStepKind::Approval->value));
        } elseif ($filters['scope'] === 'queue' && $canComplete) {
            $query->where('status', RequestStatus::Approved->value);
        } elseif ($filters['scope'] === 'mine') {
            // Filed by me, filed by me for someone, or filed for me
            $query->where(function ($q) use ($viewer, $employeeId) {
                $q->where('user_id', $viewer->id)->orWhere('submitted_by_user_id', $viewer->id);
                if ($employeeId !== null) {
                    $q->orWhere('employee_id', $employeeId);
                }
            });
        }

        $paginator = $query->paginate($filters['per_page']);
        RequestApproval::preloadGroupNames($paginator->getCollection()->flatMap->approvals);
        RequestApproval::preloadGroupCandidates($paginator->getCollection()->flatMap->approvals);

        return $paginator;
    }

    /**
     * KPI aggregates over the viewer's whole visible set, independent of page, search and filters; `period` = filed in the period.
     *
     * @return array<string, mixed>
     */
    public function meta(User $viewer, LengthAwarePaginator $paginator, OverviewPeriod $period): array
    {
        $visible = $this->visibleTo($viewer);
        $employee = $viewer->employee;
        $counts = $visible(ServiceRequest::query())
            ->selectRaw('status, count(*) as n')
            ->groupBy('status')
            ->pluck('n', 'status');

        // Counted the way the "waiting on me" tab filters, group steps included
        $awaitingMe = $employee === null ? 0 : RequestApproval::query()
            ->actionableBy($employee)
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value)
            ->count();
        $filed = $this->periodStats->for($period->apply($visible(ServiceRequest::query()), 'created_at'));

        return [
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'pending' => (int) ($counts[RequestStatus::Pending->value] ?? 0),
            'approved' => (int) ($counts[RequestStatus::Approved->value] ?? 0),
            'rejected' => (int) ($counts[RequestStatus::Rejected->value] ?? 0),
            'completed' => (int) ($counts[RequestStatus::Completed->value] ?? 0),
            'cancelled' => (int) ($counts[RequestStatus::Cancelled->value] ?? 0),
            'awaiting_me' => $awaitingMe,
            'to_complete' => $this->canComplete($viewer) ? (int) ($counts[RequestStatus::Approved->value] ?? 0) : 0,
            'period' => $filed,
        ];
    }

    /**
     * view_all (or super) sees everything; everyone else their own, the ones filed about them, the ones
     * they can act on, and with requests.complete the approved and completed queue.
     *
     * @return Closure(Builder): Builder
     */
    public function visibleTo(User $viewer): Closure
    {
        $seesAll = $viewer->isSuper() || $viewer->hasPermission('requests.view_all');
        $canComplete = $this->canComplete($viewer);
        $employeeId = $viewer->employee_id;
        $employee = $viewer->employee;

        return function ($query) use ($seesAll, $canComplete, $viewer, $employeeId, $employee) {
            if ($seesAll) {
                return $query;
            }

            return $query->where(function ($q) use ($viewer, $employeeId, $employee, $canComplete) {
                // Own requests, plus the ones filed on somebody else's behalf
                $q->where('user_id', $viewer->id)
                    ->orWhere('submitted_by_user_id', $viewer->id);
                if ($employeeId !== null) {
                    // Requests about this person, whoever filed them (onboarding has no owner account)
                    $q->orWhere('employee_id', $employeeId)
                        ->orWhereHas('approvals', fn ($a) => $a->actionableBy($employee));
                }
                if ($canComplete) {
                    $q->orWhereIn('status', [RequestStatus::Approved->value, RequestStatus::Completed->value]);
                }
            });
        };
    }

    /**
     * Approvals with their request set back on each row, so can_approve does not re-query it.
     *
     * @return array<string, Closure(HasMany): HasMany>
     */
    public static function approvalsWithParent(): array
    {
        return ['approvals' => fn (HasMany $approvals) => $approvals->chaperone('request')];
    }

    private function canComplete(User $viewer): bool
    {
        return (bool) $viewer->hasPermission('requests.complete');
    }

    /** @param  array{filed_from: ?string, filed_to: ?string, filed_days: ?int}  $filters */
    private function applyFiled(Builder $query, array $filters): void
    {
        if ($filters['filed_from'] !== null) {
            $query->whereBetween('created_at', [
                Carbon::parse($filters['filed_from'])->startOfDay(),
                Carbon::parse($filters['filed_to'])->endOfDay(),
            ]);
        } elseif ($filters['filed_days'] !== null) {
            $query->where('created_at', '>=', now()->subDays($filters['filed_days']));
        }
    }
}
