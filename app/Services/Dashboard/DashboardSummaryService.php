<?php

namespace App\Services\Dashboard;

use App\Enums\Asset\AssetStatus;
use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Ticket\TicketStatus;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;

/**
 * What the front page shows, assembled in one request.
 *
 * The page used to open with four hard-coded numbers and a table of four invented tickets
 * (TKT-2861 "Cannot connect to production VPN"), which read as live data and were not. This
 * replaces the "mine" half of that with the reader's own rows.
 *
 * Composed rather than branched on role: each block answers "may this reader see it?" on its
 * own, so somebody who is both HR and IT gets both, and a new module adds a block instead of
 * a fourth dashboard. Today only `mine` exists — it needs no permission, because every row in
 * it already belongs to the person asking. The IT and HR blocks land beside it later.
 *
 * A user with no employee record (the administrator account) owns no tickets, requests or
 * assets, and gets the same shape back with nothing in it.
 */
class DashboardSummaryService
{
    /** How many rows each list card shows before "view all". */
    private const LIST_LIMIT = 5;

    /** How far back the IT overview counts. The mockup's "last 30 days · N tickets". */
    private const WINDOW_DAYS = 30;

    /** How many days the volume chart plots, today included. */
    private const VOLUME_DAYS = 14;

    /**
     * Every block this reader may see. A block they may not is absent, not empty — the page
     * decides what to draw from which keys arrived, so "no permission" and "nothing to show"
     * never look the same.
     *
     * @return array<string, mixed>
     */
    public function forUser(?User $user): array
    {
        $blocks = ['mine' => $this->mine($user)];

        if ($user?->hasPermission('tickets.view_all')) {
            $blocks['it'] = $this->it();
        }
        if ($user?->hasPermission('employees.view_dashboard')) {
            $blocks['hr'] = $this->hr();
        }
        if ($user?->hasPermission('system.view_audit')) {
            $blocks['activity'] = $this->activity();
        }

        return $blocks;
    }

    /**
     * The reader's own work: what they are waiting on, and what is waiting on them.
     *
     * @return array<string, mixed>
     */
    private function mine(?User $user): array
    {
        $employeeId = $user?->employee_id;

        if ($user === null || $employeeId === null) {
            return [
                'kpi' => ['open_tickets' => 0, 'pending_requests' => 0, 'assets' => 0, 'resolved_this_month' => 0],
                'pending_acceptance' => [],
                'tickets' => [],
                'requests' => [],
                'assets' => [],
            ];
        }

        $openTickets = Ticket::where('requester_id', $employeeId)
            ->whereIn('status', TicketStatus::liveValues());

        // Requests still in flight: filed by this account, or filed for them by somebody else
        // (onboarding), which is the pair the Requests page itself treats as "mine".
        $openRequests = ServiceRequest::query()
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhere('employee_id', $employeeId))
            ->whereIn('status', [RequestStatus::Pending->value, RequestStatus::Approved->value]);

        $myAssets = Asset::where('owner_employee_id', $employeeId)
            ->whereIn('status', [AssetStatus::Deployed->value, AssetStatus::PendingAcceptance->value]);

        return [
            'kpi' => [
                'open_tickets' => (clone $openTickets)->count(),
                'pending_requests' => (clone $openRequests)->count(),
                'assets' => (clone $myAssets)->count(),
                // resolved_at is stamped on both outcomes, so a cancelled case counts as closed
                // this month too — the card says "closed", not "solved".
                'resolved_this_month' => Ticket::where('requester_id', $employeeId)
                    ->whereNotNull('resolved_at')
                    ->where('resolved_at', '>=', now()->startOfMonth())
                    ->count(),
            ],
            // The one thing on this page that asks the reader to act, so it is a list and not
            // a number: each row is an asset they have to accept before it counts as theirs.
            'pending_acceptance' => Asset::with('model')
                ->where('owner_employee_id', $employeeId)
                ->where('status', AssetStatus::PendingAcceptance->value)
                ->latest('id')
                ->get()
                ->map(fn (Asset $asset) => [
                    'id' => $asset->id,
                    'asset_code' => $asset->asset_code,
                    'tag' => $asset->tag,
                    'model' => $asset->model?->name,
                ])->all(),
            'tickets' => (clone $openTickets)->with('assignee')->latest('id')->limit(self::LIST_LIMIT)->get()
                ->map(fn (Ticket $ticket) => [
                    'id' => $ticket->id,
                    'ticket_no' => $ticket->ticket_no,
                    'subject' => $ticket->subject,
                    'status' => $ticket->status?->value,
                    'assignee_name' => $ticket->assignee?->name,
                ])->all(),
            'requests' => (clone $openRequests)->latest('id')->limit(self::LIST_LIMIT)->get()
                ->map(fn (ServiceRequest $request) => [
                    'id' => $request->id,
                    'reference' => $request->reference,
                    'title' => $request->title,
                    'status' => $request->status?->value,
                ])->all(),
            'assets' => (clone $myAssets)->with(['model', 'category'])->latest('id')->limit(self::LIST_LIMIT)->get()
                ->map(fn (Asset $asset) => [
                    'id' => $asset->id,
                    'asset_code' => $asset->asset_code,
                    'tag' => $asset->tag,
                    'model' => $asset->model?->name,
                    'category' => $asset->category?->name,
                    'status' => $asset->status?->value,
                ])->all(),
        ];
    }

    /**
     * The IT half: how the last 30 days of cases are split, and who is carrying them.
     *
     * Counted from `created_at` rather than "everything still open", because the question the
     * card answers is what came in lately — a case opened in March skews a picture of March.
     *
     * @return array<string, mixed>
     */
    private function it(): array
    {
        $since = now()->subDays(self::WINDOW_DAYS);

        $byStatus = Ticket::where('created_at', '>=', $since)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        // Everyone currently holding an open case, plus what they have closed in the window.
        // Unassigned cases are a row of their own: a queue nobody owns is the thing this card
        // exists to make visible, and hiding it under "no assignee" would bury it.
        $open = Ticket::query()
            ->whereIn('status', TicketStatus::liveValues())
            ->selectRaw('assignee_id, COUNT(*) as total')
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');

        $closed = Ticket::query()
            ->whereNotNull('assignee_id')
            ->where('resolved_at', '>=', $since)
            ->selectRaw('assignee_id, COUNT(*) as total')
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');

        $names = User::whereIn('id', $open->keys()->merge($closed->keys())->filter()->all())->pluck('name', 'id');

        $workload = $open->keys()->merge($closed->keys())->unique()
            ->map(fn ($id) => [
                'assignee_id' => $id === '' || $id === null ? null : (int) $id,
                'name' => $names[$id] ?? null,
                'open' => (int) ($open[$id] ?? 0),
                'closed' => (int) ($closed[$id] ?? 0),
            ])
            // Busiest first; the unassigned row sorts with the rest so a big queue cannot hide
            // at the bottom.
            ->sortByDesc('open')
            ->values()
            ->all();

        return [
            'window_days' => self::WINDOW_DAYS,
            'by_status' => [
                'open' => (int) ($byStatus[TicketStatus::Open->value] ?? 0),
                'in_progress' => (int) ($byStatus[TicketStatus::InProgress->value] ?? 0),
                'completed' => (int) ($byStatus[TicketStatus::Completed->value] ?? 0),
                'canceled' => (int) ($byStatus[TicketStatus::Canceled->value] ?? 0),
            ],
            'workload' => $workload,
            'volume_days' => self::VOLUME_DAYS,
            'volume' => $this->volume(),
        ];
    }

    /**
     * Two weeks of case flow: how many arrived each day, and how many were still open when
     * that day ended.
     *
     * The second one is a level, not a count of events, so it is reconstructed rather than
     * counted: start from what was open before the window and walk the days, adding what
     * arrived and subtracting what closed. Both timestamps are on the row, which is what
     * makes the past recoverable at all — nothing here is stored day by day.
     *
     * Three queries whatever the window: opened per day, closed per day, and the opening
     * balance. Fourteen point-in-time counts would have been fourteen table scans.
     *
     * @return list<array{date: string, opened: int, backlog: int}>
     */
    private function volume(): array
    {
        $start = now()->startOfDay()->subDays(self::VOLUME_DAYS - 1);

        $opened = Ticket::where('created_at', '>=', $start)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->groupBy('day')->pluck('total', 'day');

        $closed = Ticket::whereNotNull('resolved_at')->where('resolved_at', '>=', $start)
            ->selectRaw('DATE(resolved_at) as day, COUNT(*) as total')
            ->groupBy('day')->pluck('total', 'day');

        // What the backlog already stood at when the window opened: filed before it, and not
        // yet closed by then.
        $backlog = Ticket::where('created_at', '<', $start)
            ->where(fn ($q) => $q->whereNull('resolved_at')->orWhere('resolved_at', '>=', $start))
            ->count();

        $series = [];
        for ($i = 0; $i < self::VOLUME_DAYS; $i++) {
            $day = $start->copy()->addDays($i)->toDateString();
            $in = (int) ($opened[$day] ?? 0);
            $backlog += $in - (int) ($closed[$day] ?? 0);

            $series[] = ['date' => $day, 'opened' => $in, 'backlog' => max(0, $backlog)];
        }

        return $series;
    }

    /**
     * The HR half: who joined, who is leaving, and what IT still owes the new starters.
     *
     * @return array<string, mixed>
     */
    private function hr(): array
    {
        $monthStart = now()->startOfMonth();

        return [
            'kpi' => [
                'headcount' => Employee::where('status', EmployeeStatus::Active->value)->count(),
                'new_this_month' => Employee::where('status', EmployeeStatus::Active->value)
                    ->where('joined_at', '>=', $monthStart)->count(),
                // Onboarding requests IT has not finished — the queue HR actually chases.
                'pending_onboarding' => ServiceRequest::where('origin', RequestOrigin::Onboarding->value)
                    ->whereIn('status', [RequestStatus::Pending->value, RequestStatus::Approved->value])
                    ->count(),
                'resigned_this_month' => Employee::where('status', EmployeeStatus::Resigned->value)
                    ->where('last_day', '>=', $monthStart)->count(),
            ],
            'recent_hires' => Employee::with(['position', 'department'])
                ->where('status', EmployeeStatus::Active->value)
                ->whereNotNull('joined_at')
                ->latest('joined_at')
                ->limit(self::LIST_LIMIT)
                ->get()
                ->map(fn (Employee $employee) => [
                    'id' => $employee->id,
                    'name' => trim("{$employee->first_name} {$employee->last_name}"),
                    'position' => $employee->position?->title,
                    'department' => $employee->department?->name,
                    'joined_at' => $employee->joined_at?->toDateString(),
                ])->all(),
            'headcount_by_department' => Department::withCount([
                'employees' => fn ($q) => $q->where('status', EmployeeStatus::Active->value),
            ])
                ->get()
                ->filter(fn (Department $department) => $department->employees_count > 0)
                ->sortByDesc('employees_count')
                ->map(fn (Department $department) => [
                    'id' => $department->id,
                    'name' => $department->name,
                    'name_th' => $department->name_th,
                    'count' => $department->employees_count,
                ])->values()->all(),
        ];
    }

    /**
     * The last few things that happened, from the audit log.
     *
     * Gated by system.view_audit — the same right that opens the full log. The feed is a
     * shorter view of that page, not a second, laxer way into it.
     *
     * @return list<array<string, mixed>>
     */
    private function activity(): array
    {
        return AuditLog::latest('id')->limit(8)->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'actor' => $log->user_name,
                'action' => $log->action,
                'target' => $log->target,
                'at' => $log->created_at?->toIso8601String(),
            ])->all();
    }
}
