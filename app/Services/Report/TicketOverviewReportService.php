<?php

namespace App\Services\Report;

use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Department;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\Permissions;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "Ticket & SLA overview" report (Report Center → Tickets).
 *
 * Population: tickets opened (created_at) inside [from, to], limited to the viewer's
 * ticket levels and the optional category / priority / department / assignee filters.
 * Everything is aggregated in PHP over one fetched population so MariaDB (live) and
 * SQLite (tests) give identical answers; ranges are capped at 366 days by the request.
 *
 * - SLA: completed tickets with both resolved_at and a resolve deadline are "measured";
 *   met = resolved on or before the deadline. Rates are null when nothing was measured.
 * - Resolve hours: calendar hours opened → resolved; median / P90 by nearest rank.
 * - Backlog: live tickets matching the filters, ignoring the date range.
 * - Weekly: Monday-start weeks; "closed" counts completions whose resolved_at is in range.
 * - Previous: the same-length window immediately before `from`.
 */
class TicketOverviewReportService
{
    /** Target line drawn on the SLA meter. */
    public const SLA_GOAL_PERCENT = 90;

    private const POPULATION_COLUMNS = [
        'id', 'category', 'priority', 'status', 'created_at', 'resolved_at',
        'sla_resolve_due_at', 'assignee_id', 'requester_id',
    ];

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     * @return array<string, mixed>
     */
    public function summary(User $viewer, array $filters): array
    {
        $now = now();
        $tickets = $this->inRange($viewer, $filters)
            ->with(['requester:id,department_id', 'assignee:id,name'])
            ->get(self::POPULATION_COLUMNS);
        $completed = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed)->values();
        $hours = $this->sortedHours($completed);

        return [
            'range' => ['from' => $filters['from']->toDateString(), 'to' => $filters['to']->toDateString()],
            'generated_at' => $now->format('Y-m-d H:i'),
            'sla_goal' => self::SLA_GOAL_PERCENT,
            'kpi' => [
                'total' => $tickets->count(),
                'completed' => $completed->count(),
                'canceled' => $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Canceled)->count(),
                ...$this->slaCounts($completed),
                'median_resolve_hours' => $this->percentile($hours, 0.5),
                'p90_resolve_hours' => $this->percentile($hours, 0.9),
            ],
            'previous' => $this->previous($viewer, $filters),
            'backlog' => $this->backlog($viewer, $filters, $now),
            'weekly' => $this->weekly($viewer, $filters, $tickets),
            'sla_by_priority' => $this->slaByPriority($completed),
            'by_category' => $this->byCategory($tickets),
            'by_department' => $this->byDepartment($tickets),
            'by_assignee' => $this->byAssignee($completed),
            'options' => $this->options($viewer),
        ];
    }

    /**
     * Viewer scope + non-date filters. Shared by the backlog (which ignores the range).
     *
     * @param  array{categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     */
    public function scoped(User $viewer, array $filters): Builder
    {
        $levels = Permissions::ticketLevelsFor($viewer);
        $categories = $filters['categories'] === []
            ? $levels
            : array_values(array_intersect($filters['categories'], $levels));

        return Ticket::query()
            ->whereIn('category', $categories)
            ->when($filters['priority'], fn (Builder $q, string $priority) => $q->where('priority', $priority))
            ->when($filters['department_id'], fn (Builder $q, int $id) => $q->whereHas(
                'requester',
                fn (Builder $r) => $r->where('department_id', $id),
            ))
            ->when($filters['assignee_id'], fn (Builder $q, int $id) => $q->where('assignee_id', $id));
    }

    /**
     * The report population: scoped tickets opened inside the range.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     */
    public function inRange(User $viewer, array $filters): Builder
    {
        return $this->scoped($viewer, $filters)->whereBetween('created_at', [$filters['from'], $filters['to']]);
    }

    /**
     * The row table under the charts, newest first.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     */
    public function rows(User $viewer, array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->withRowRelations($this->inRange($viewer, $filters))->latest('id')->paginate($perPage);
    }

    /**
     * Every row for an export; `$limit` caps PDF exports.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     * @return Collection<int, Ticket>
     */
    public function exportRows(User $viewer, array $filters, ?int $limit = null): Collection
    {
        return $this->withRowRelations($this->inRange($viewer, $filters))
            ->latest('id')
            ->when($limit, fn (Builder $q, int $limit) => $q->limit($limit))
            ->get();
    }

    private function withRowRelations(Builder $query): Builder
    {
        return $query->with(['requester.department:id,name,name_th', 'assignee:id,name']);
    }

    /**
     * @param  Collection<int, Ticket>  $completed
     * @return array{sla_measured: int, sla_met: int, sla_rate: ?float}
     */
    private function slaCounts(Collection $completed): array
    {
        $measured = $completed->filter(fn (Ticket $t) => $t->resolved_at !== null && $t->sla_resolve_due_at !== null);
        $met = $measured->filter(fn (Ticket $t) => $t->resolved_at->lte($t->sla_resolve_due_at))->count();

        return ['sla_measured' => $measured->count(), 'sla_met' => $met, 'sla_rate' => $this->rate($met, $measured->count())];
    }

    private function rate(int $part, int $whole): ?float
    {
        return $whole === 0 ? null : round($part / $whole * 100, 1);
    }

    /**
     * @param  Collection<int, Ticket>  $completed
     * @return Collection<int, float>
     */
    private function sortedHours(Collection $completed): Collection
    {
        return $completed->map(fn (Ticket $t) => TicketMetrics::resolveHours($t))
            ->filter(fn (?float $h) => $h !== null)
            ->sort()
            ->values();
    }

    /** Nearest-rank percentile of an ascending list; null when empty. */
    private function percentile(Collection $sorted, float $p): ?float
    {
        if ($sorted->isEmpty()) {
            return null;
        }

        $index = max(0, (int) ceil($p * $sorted->count()) - 1);

        return round((float) $sorted[$index], 1);
    }

    /**
     * @return array{from: string, to: string, total: int, sla_rate: ?float}
     */
    private function previous(User $viewer, array $filters): array
    {
        $days = (int) $filters['from']->diffInDays($filters['to']->startOfDay()) + 1;
        $to = $filters['from']->subDay()->endOfDay();
        $from = $to->subDays($days - 1)->startOfDay();

        $tickets = $this->inRange($viewer, [...$filters, 'from' => $from, 'to' => $to])
            ->get(['id', 'status', 'resolved_at', 'sla_resolve_due_at']);
        $completed = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total' => $tickets->count(),
            'sla_rate' => $this->slaCounts($completed)['sla_rate'],
        ];
    }

    /**
     * @return array{open: int, in_progress: int, breached: int, aging: array{d1: int, d3: int, d7: int, older: int}}
     */
    private function backlog(User $viewer, array $filters, CarbonInterface $now): array
    {
        $live = $this->scoped($viewer, $filters)
            ->whereIn('status', TicketStatus::liveValues())
            ->get(['id', 'status', 'created_at', 'responded_at', 'sla_response_due_at', 'sla_resolve_due_at']);

        $aging = ['d1' => 0, 'd3' => 0, 'd7' => 0, 'older' => 0];
        foreach ($live as $ticket) {
            $days = $ticket->created_at->diffInHours($now, true) / 24;
            $bucket = match (true) {
                $days <= 1 => 'd1',
                $days <= 3 => 'd3',
                $days <= 7 => 'd7',
                default => 'older',
            };
            $aging[$bucket]++;
        }

        return [
            'open' => $live->filter(fn (Ticket $t) => $t->status === TicketStatus::Open)->count(),
            'in_progress' => $live->filter(fn (Ticket $t) => $t->status === TicketStatus::InProgress)->count(),
            'breached' => $live->filter(fn (Ticket $t) => TicketMetrics::slaState($t, $now) === 'breached')->count(),
            'aging' => $aging,
        ];
    }

    /**
     * @param  Collection<int, Ticket>  $population
     * @return list<array{week_start: string, opened: int, closed: int}>
     */
    private function weekly(User $viewer, array $filters, Collection $population): array
    {
        $weeks = [];
        for ($week = $filters['from']->startOfWeek(CarbonInterface::MONDAY); $week->lte($filters['to']); $week = $week->addWeek()) {
            $weeks[$week->toDateString()] = ['week_start' => $week->toDateString(), 'opened' => 0, 'closed' => 0];
        }

        foreach ($population as $ticket) {
            $weeks[$this->weekOf($ticket->created_at)]['opened']++;
        }

        $resolvedAt = $this->scoped($viewer, $filters)
            ->where('status', TicketStatus::Completed->value)
            ->whereBetween('resolved_at', [$filters['from'], $filters['to']])
            ->pluck('resolved_at');
        foreach ($resolvedAt as $at) {
            $weeks[$this->weekOf(CarbonImmutable::parse($at))]['closed']++;
        }

        return array_values($weeks);
    }

    private function weekOf(CarbonInterface $at): string
    {
        return $at->toImmutable()->startOfWeek(CarbonInterface::MONDAY)->toDateString();
    }

    /**
     * @param  Collection<int, Ticket>  $completed
     * @return list<array{priority: string, measured: int, met: int, rate: ?float}>
     */
    private function slaByPriority(Collection $completed): array
    {
        return array_map(function (TicketPriority $priority) use ($completed) {
            $counts = $this->slaCounts($completed->filter(fn (Ticket $t) => $t->priority === $priority));

            return ['priority' => $priority->value, 'measured' => $counts['sla_measured'], 'met' => $counts['sla_met'], 'rate' => $counts['sla_rate']];
        }, TicketPriority::cases());
    }

    /**
     * @param  Collection<int, Ticket>  $tickets
     * @return list<array{category: string, count: int}>
     */
    private function byCategory(Collection $tickets): array
    {
        return $tickets->groupBy(fn (Ticket $t) => $t->category->value)
            ->map(fn (Collection $group, string $category) => ['category' => $category, 'count' => $group->count()])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    /**
     * Top 6 requesting departments. Tickets from employees without a department group
     * under department_id null.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, count: int, sla_rate: ?float}>
     */
    private function byDepartment(Collection $tickets): array
    {
        $groups = $tickets->groupBy(fn (Ticket $t) => $t->requester?->department_id ?? 0);
        $departments = Department::query()->whereIn('id', $groups->keys()->filter())->get(['id', 'name', 'name_th'])->keyBy('id');

        return $groups->map(function (Collection $group, int $id) use ($departments) {
            $completed = $group->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed);

            return [
                'department_id' => $id === 0 ? null : $id,
                'name' => $departments->get($id)?->name,
                'name_th' => $departments->get($id)?->name_th,
                'count' => $group->count(),
                'sla_rate' => $this->slaCounts($completed)['sla_rate'],
            ];
        })->sortByDesc('count')->take(6)->values()->all();
    }

    /**
     * Top 5 staff by completed tickets.
     *
     * @param  Collection<int, Ticket>  $completed
     * @return list<array{assignee_id: int, name: ?string, completed: int, median_resolve_hours: ?float}>
     */
    private function byAssignee(Collection $completed): array
    {
        return $completed->filter(fn (Ticket $t) => $t->assignee_id !== null)
            ->groupBy('assignee_id')
            ->map(fn (Collection $group, int $id) => [
                'assignee_id' => $id,
                'name' => $group->first()->assignee?->name,
                'completed' => $group->count(),
                'median_resolve_hours' => $this->percentile($this->sortedHours($group), 0.5),
            ])
            ->sortByDesc('completed')
            ->take(5)
            ->values()
            ->all();
    }

    /**
     * Filter choices. Assignees are the accounts that have ever held a ticket, which
     * keeps the list to IT staff without needing the Employee module's permissions.
     * Categories are limited to the viewer's ticket levels so the filter never offers
     * a category the population itself can never contain.
     *
     * @return array{departments: list<array{id: int, name: string, name_th: ?string}>, assignees: list<array{id: int, name: string}>, categories: list<string>}
     */
    private function options(User $viewer): array
    {
        $assigneeIds = Ticket::query()->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return [
            'departments' => Department::query()->orderBy('name')->get(['id', 'name', 'name_th'])->toArray(),
            'assignees' => User::query()->whereIn('id', $assigneeIds)->orderBy('name')->get(['id', 'name'])->toArray(),
            'categories' => Permissions::ticketLevelsFor($viewer),
        ];
    }
}
