<?php

namespace App\Services\Dashboard;

use App\Enums\Asset\AssetStatus;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Enums\Ticket\TicketStatus;
use App\Models\Access\AccessMembership;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Access\AccessFacts;
use App\Services\Report\TicketMetrics;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

/**
 * The reader's own half of the Dashboard: what they asked for, what they hold, and what waits on them.
 */
class MineBlock
{
    private const LIST_LIMIT = 5;

    /**
     * @return array<string, mixed>
     */
    public function build(User $user): array
    {
        $employeeId = $user->employee_id;
        $openTickets = $this->ofEmployee(Ticket::query(), 'requester_id', $employeeId)
            ->whereIn('status', TicketStatus::liveValues());
        $requests = $this->myRequests($user, $employeeId);

        return [
            'kpi' => $this->kpi($employeeId, clone $openTickets, clone $requests),
            'todo' => [
                'my_jobs' => $this->myJobs($user),
                'approvals' => $this->approvals($user->employee),
                'pending_acceptance' => $this->pendingAcceptance($employeeId),
            ],
            'tickets' => (clone $openTickets)->with('assignee.employee')->latest('id')->limit(self::LIST_LIMIT)->get()
                ->map(fn (Ticket $ticket) => [
                    'id' => $ticket->id,
                    'ticket_no' => $ticket->ticket_no,
                    'subject' => $ticket->subject,
                    'status' => $ticket->status?->value,
                    'assignee_name' => $ticket->assignee?->name,
                    'assignee_name_th' => $ticket->assignee?->name_th,
                ])->all(),
            'tickets_total' => (clone $openTickets)->count(),
            'requests' => (clone $requests)->latest('id')->limit(self::LIST_LIMIT)->get()
                ->map(fn (ServiceRequest $request) => [
                    'id' => $request->id,
                    'reference' => $request->reference,
                    'title' => $request->title,
                    'status' => $request->status?->value,
                ])->all(),
            'requests_total' => (clone $requests)->count(),
        ];
    }

    /**
     * Rows of this employee; none at all without one (where('col', null) would match orphan rows).
     */
    private function ofEmployee(Builder $query, string $column, ?int $employeeId): Builder
    {
        return $employeeId === null ? $query->whereRaw('1 = 0') : $query->where($column, $employeeId);
    }

    /**
     * Same "mine" as the Requests page: filed by me, filed by me for someone, or filed for me.
     */
    private function myRequests(User $user, ?int $employeeId): Builder
    {
        return ServiceRequest::query()->where(function (Builder $q) use ($user, $employeeId) {
            $q->where('user_id', $user->id)->orWhere('submitted_by_user_id', $user->id);
            if ($employeeId !== null) {
                $q->orWhere('employee_id', $employeeId);
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function kpi(?int $employeeId, Builder $openTickets, Builder $requests): array
    {
        $ticketsByStatus = $openTickets->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $requestsByStatus = $requests
            ->whereIn('status', [RequestStatus::Pending->value, RequestStatus::Approved->value])
            ->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $assetsByStatus = $this->ofEmployee(Asset::query(), 'owner_employee_id', $employeeId)
            ->whereIn('status', [AssetStatus::Deployed->value, AssetStatus::PendingAcceptance->value])
            ->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $accessByType = $this->ofEmployee(AccessMembership::active(), 'employee_id', $employeeId)
            ->selectRaw('resource_type, COUNT(*) as total')->groupBy('resource_type')->pluck('total', 'resource_type');
        $access = collect(AccessFacts::TYPES)->mapWithKeys(fn (string $type) => [$type => (int) ($accessByType[$type] ?? 0)])->all();

        return [
            'open_tickets' => (int) $ticketsByStatus->sum(),
            'open_split' => [
                'open' => (int) ($ticketsByStatus[TicketStatus::Open->value] ?? 0),
                'in_progress' => (int) ($ticketsByStatus[TicketStatus::InProgress->value] ?? 0),
            ],
            'requests_unfinished' => (int) $requestsByStatus->sum(),
            'requests_split' => [
                'pending' => (int) ($requestsByStatus[RequestStatus::Pending->value] ?? 0),
                'approved' => (int) ($requestsByStatus[RequestStatus::Approved->value] ?? 0),
            ],
            'assets' => (int) $assetsByStatus->sum(),
            'assets_pending' => (int) ($assetsByStatus[AssetStatus::PendingAcceptance->value] ?? 0),
            'access_total' => array_sum($access),
            'access_by_type' => $access,
            // resolved_at is stamped on both outcomes, so a cancelled case counts as closed too.
            'closed_this_month' => $this->ofEmployee(Ticket::query(), 'requester_id', $employeeId)
                ->whereNotNull('resolved_at')
                ->where('resolved_at', '>=', now()->startOfMonth())
                ->count(),
        ];
    }

    /**
     * The Tickets page's "My Jobs", split the way the backlog report splits SLA; null when none.
     *
     * @return array{total: int, over_sla: int, due_soon: int, on_track: int}|null
     */
    private function myJobs(User $user): ?array
    {
        $now = now();
        $states = Ticket::where('assignee_id', $user->id)
            ->whereIn('status', TicketStatus::liveValues())
            ->get(['id', 'status', 'responded_at', 'sla_response_due_at', 'sla_resolve_due_at'])
            ->countBy(fn (Ticket $ticket) => TicketMetrics::liveSlaState($ticket, $now));

        $total = (int) $states->sum();
        if ($total === 0) {
            return null;
        }

        return [
            'total' => $total,
            'over_sla' => (int) ($states['over_sla'] ?? 0),
            'due_soon' => (int) ($states['due_soon'] ?? 0),
            'on_track' => (int) (($states['on_track'] ?? 0) + ($states['no_due'] ?? 0)),
        ];
    }

    /**
     * Steps waiting on this reader — counted like the Requests page's "waiting on me" card; null when none.
     *
     * @return array{count: int, oldest_days: int}|null
     */
    private function approvals(?Employee $employee): ?array
    {
        if ($employee === null) {
            return null;
        }

        $steps = RequestApproval::query()
            ->actionableBy($employee)
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value);
        $count = (clone $steps)->count();
        if ($count === 0) {
            return null;
        }

        $since = (clone $steps)->min('became_current_at');

        return ['count' => $count, 'oldest_days' => $since === null ? 0 : (int) Carbon::parse($since)->diffInDays(now())];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function pendingAcceptance(?int $employeeId): array
    {
        return $this->ofEmployee(Asset::with(['model', 'category']), 'owner_employee_id', $employeeId)
            ->where('status', AssetStatus::PendingAcceptance->value)
            ->latest('id')
            ->get()
            ->map(fn (Asset $asset) => [
                'id' => $asset->id,
                'asset_code' => $asset->asset_code,
                'tag' => $asset->tag,
                'model' => $asset->model?->name,
                'category' => $asset->category?->name,
                'category_th' => $asset->category?->name_th,
            ])->all();
    }
}
