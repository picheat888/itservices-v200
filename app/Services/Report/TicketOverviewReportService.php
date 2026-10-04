<?php

namespace App\Services\Report;

use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Department;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\Permissions;
use App\Support\TicketSla;
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
 * - Resolve hours: calendar hours opened → resolved; the mean (to one decimal) and P90 by
 *   nearest rank. (Median until 2026-10-02 — the user chose the mean.)
 * - Backlog: live tickets matching the filters, ignoring the date range.
 * - Weekly: Monday-start weeks; "closed" counts completions whose resolved_at is in range.
 * - Previous: the same-length window immediately before `from`.
 * - Staff (by_assignee): unlike the rest, counts what was closed (resolved_at) inside the
 *   range, and nothing outside it — merged in from the former "ผลงานเจ้าหน้าที่ IT".
 * - Departments (by_department): every department, split by category — merged in from the
 *   former "Ticket ตามแผนกและหมวด".
 */
class TicketOverviewReportService
{
    private const POPULATION_COLUMNS = [
        'id', 'category', 'priority', 'status', 'created_at', 'resolved_at',
        'sla_resolve_due_at', 'assignee_id', 'requester_id',
    ];

    /**
     * The report's filters from validated request input. Static so a queued export
     * (GenerateReportExport) rebuilds exactly what the screen asked for from the input it stored.
     *
     * @param  array<string, mixed>  $input
     * @return array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}
     */
    public static function resolveFilters(array $input): array
    {
        return [
            'from' => CarbonImmutable::parse($input['from'])->startOfDay(),
            'to' => CarbonImmutable::parse($input['to'])->endOfDay(),
            'categories' => array_values($input['categories'] ?? []),
            'priority' => $input['priority'] ?? null,
            'department_id' => filled($input['department_id'] ?? null) ? (int) $input['department_id'] : null,
            'assignee_id' => filled($input['assignee_id'] ?? null) ? (int) $input['assignee_id'] : null,
        ];
    }

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
            // Settings → SLA (TicketSla::goalPercent) — the goal line and badge on the report.
            'sla_goal' => TicketSla::goalPercent(),
            'kpi' => [
                'total' => $tickets->count(),
                'completed' => $completed->count(),
                'canceled' => $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Canceled)->count(),
                ...$this->slaCounts($completed),
                'avg_resolve_hours' => $this->average($hours),
                'p90_resolve_hours' => $this->percentile($hours, 0.9),
            ],
            'previous' => $this->previous($viewer, $filters),
            'backlog' => $this->backlog($viewer, $filters, $now),
            'weekly' => $this->weekly($viewer, $filters, $tickets),
            'sla_by_priority' => $this->slaByPriority($completed),
            'by_category' => $this->byCategory($tickets),
            'by_department' => $this->byDepartment($tickets),
            'by_assignee' => $this->byAssignee($viewer, $filters),
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

    /** Mean of the resolve hours, to one decimal; null when there are none. */
    private function average(Collection $hours): ?float
    {
        return $hours->isEmpty() ? null : round((float) $hours->avg(), 1);
    }

    /** Nearest-rank percentile of an ascending list; null when empty. */
    private function percentile(Collection $sorted, float $p): ?float
    {
        return TicketMetrics::percentile($sorted, $p);
    }

    /**
     * @return array{from: string, to: string, total: int, sla_rate: ?float, avg_resolve_hours: ?float}
     */
    private function previous(User $viewer, array $filters): array
    {
        $days = (int) $filters['from']->diffInDays($filters['to']->startOfDay()) + 1;
        $to = $filters['from']->subDay()->endOfDay();
        $from = $to->subDays($days - 1)->startOfDay();

        $tickets = $this->inRange($viewer, [...$filters, 'from' => $from, 'to' => $to])
            ->get(['id', 'status', 'created_at', 'resolved_at', 'sla_resolve_due_at']);
        $completed = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total' => $tickets->count(),
            'sla_rate' => $this->slaCounts($completed)['sla_rate'],
            // The resolve-time KPI's "▼ 0.6 ชม." against the period before.
            'avg_resolve_hours' => $this->average($this->sortedHours($completed)),
        ];
    }

    /**
     * @return array{open: int, in_progress: int, over_sla: int, aging: array{d1: int, d3: int, d7: int, older: int}}
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
            'over_sla' => $live->filter(fn (Ticket $t) => TicketMetrics::slaState($t, $now) === 'over_sla')->count(),
            'aging' => $aging,
        ];
    }

    /**
     * @param  Collection<int, Ticket>  $population
     *                                               `backlog` is how many tickets were still open at the end of each week (or now, for the
     *                                               current week) — the chart's "ค้างสะสม" line. resolved_at is stamped on complete and on
     *                                               cancel alike, so a ticket counts until either.
     * @return list<array{week_start: string, opened: int, closed: int, backlog: int}>
     */
    private function weekly(User $viewer, array $filters, Collection $population): array
    {
        $weeks = [];
        for ($week = $filters['from']->startOfWeek(CarbonInterface::MONDAY); $week->lte($filters['to']); $week = $week->addWeek()) {
            $weeks[$week->toDateString()] = ['week_start' => $week->toDateString(), 'opened' => 0, 'closed' => 0, 'backlog' => 0];
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

        $now = CarbonImmutable::now();
        $firstWeek = $filters['from']->startOfWeek(CarbonInterface::MONDAY);
        $live = $this->scoped($viewer, $filters)
            ->where('created_at', '<=', $filters['to']->min($now))
            ->where(fn (Builder $q) => $q->whereNull('resolved_at')->orWhere('resolved_at', '>', $firstWeek))
            ->get(['created_at', 'resolved_at']);
        foreach ($weeks as $start => $week) {
            $moment = CarbonImmutable::parse($start)->endOfWeek(CarbonInterface::SUNDAY)->min($filters['to'])->min($now);
            $weeks[$start]['backlog'] = $live
                ->filter(fn (Ticket $t) => $t->created_at <= $moment && ($t->resolved_at === null || $t->resolved_at > $moment))
                ->count();
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
     * Every requesting department, busiest first: its tickets split by category, how many of
     * them are still open, and its SLA counts. met/measured travel with the rate so the page
     * can fold the quiet tail into one "อื่น ๆ" row with a true rate. Requesters without a
     * department share the department_id null row, which the page shows apart.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, count: int, categories: array<string, int>, open: int, sla_measured: int, sla_met: int, sla_rate: ?float}>
     */
    private function byDepartment(Collection $tickets): array
    {
        $groups = $tickets->groupBy(fn (Ticket $t) => $t->requester?->department_id ?? 0);
        $departments = Department::query()->whereIn('id', $groups->keys()->filter())->get(['id', 'name', 'name_th'])->keyBy('id');

        [$named, $none] = $groups->map(function (Collection $group, int $id) use ($departments) {
            $completed = $group->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed);

            return [
                'department_id' => $id === 0 ? null : $id,
                'name' => $departments->get($id)?->name,
                'name_th' => $departments->get($id)?->name_th,
                'count' => $group->count(),
                'categories' => $group->countBy(fn (Ticket $t) => $t->category->value)->all(),
                'open' => $group->filter(fn (Ticket $t) => in_array($t->status->value, TicketStatus::liveValues(), true))->count(),
                ...$this->slaCounts($completed),
            ];
        })->partition(fn (array $row) => $row['department_id'] !== null);

        // "ไม่ระบุแผนก" goes last whatever its size, as the page shows it apart.
        return $named->sortBy([['count', 'desc'], ['name', 'asc']])->concat($none)->values()->all();
    }

    /**
     * Every IT staff member who closed something in the range — by resolved_at, so a case
     * opened last month and finished this month counts this month — with how fast and how
     * often inside SLA. Only the chosen period: what someone holds right now is not counted
     * here. Most closed first.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     * @return list<array{assignee_id: int, name: ?string, total: int, completed: int, canceled: int, avg_resolve_hours: ?float, sla_measured: int, sla_met: int, sla_rate: ?float}>
     */
    private function byAssignee(User $viewer, array $filters): array
    {
        $tickets = $this->scoped($viewer, $filters)
            ->whereNotNull('assignee_id')
            ->whereIn('status', [TicketStatus::Completed->value, TicketStatus::Canceled->value])
            ->whereBetween('resolved_at', [$filters['from'], $filters['to']])
            ->with('assignee:id,name')
            ->get(['id', 'assignee_id', 'status', 'created_at', 'resolved_at', 'sla_resolve_due_at']);

        return $tickets->groupBy('assignee_id')
            ->map(function (Collection $group, int $id) {
                $completed = $group->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed);

                return [
                    'assignee_id' => $id,
                    'name' => $group->first()->assignee?->name,
                    // Every case they closed in the range, completed or canceled.
                    'total' => $group->count(),
                    'completed' => $completed->count(),
                    'canceled' => $group->filter(fn (Ticket $t) => $t->status === TicketStatus::Canceled)->count(),
                    'avg_resolve_hours' => $this->average($this->sortedHours($completed)),
                    ...$this->slaCounts($completed),
                ];
            })
            ->sortBy([['completed', 'desc'], ['name', 'asc']])
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
