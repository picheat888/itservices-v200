<?php

// The ticket list behind GET /tickets: tab and Level scope, search, filters, sort, and the tab badge counts.

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\Permissions;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class TicketListService
{
    public function __construct(private readonly TicketActionGuard $guard) {}

    /**
     * One page of the list plus the tab badges; the viewer's scope is resolved once for both.
     *
     * @param  array{requested: bool, mine: bool, sort: string, over_sla: bool, search: mixed, status: mixed, category: mixed, priority: mixed, per_page: int}  $filters
     * @return array{page: LengthAwarePaginator, counts: array{open_count: int, my_jobs_count: int, my_tickets_count: int}}
     */
    public function page(User $viewer, array $filters): array
    {
        $levels = $this->guard->seesAllTickets($viewer) ? Permissions::ticketLevelsFor($viewer) : null;

        return [
            'page' => $this->paginate($viewer, $levels, $filters),
            'counts' => $this->tabCounts($viewer, $levels),
        ];
    }

    /**
     * @param  list<string>|null  $levels  the viewer's Levels when they see every ticket, null when they see only their own
     * @param  array{requested: bool, mine: bool, sort: string, over_sla: bool, search: mixed, status: mixed, category: mixed, priority: mixed, per_page: int}  $filters
     */
    private function paginate(User $viewer, ?array $levels, array $filters): LengthAwarePaginator
    {
        $query = Ticket::query()->with(['requester', 'assignee.employee', 'relatedAsset.category', 'relatedAsset.brand', 'relatedAsset.model', 'attachments', 'serviceRequest']);

        if ($filters['requested']) {
            $this->filedBy($query, $viewer);
        }

        if ($filters['mine']) {
            $query->where('assignee_id', $viewer->id);
            // My Jobs: work in motion first, finished work below; the chosen sort applies within each group
            $query->orderByRaw("CASE WHEN status IN ('completed', 'canceled') THEN 1 ELSE 0 END");
        }

        $this->sort($query, $filters['sort']);

        if ($filters['over_sla']) {
            $query->whereIn('status', TicketStatus::liveValues())
                ->whereRaw(self::activeDue().' < ?', [now()->toDateTimeString()]);
        }

        if ($levels === null) {
            $this->filedBy($query, $viewer);
        } elseif (! $filters['mine'] && ! $filters['requested']) {
            // The all-tickets tab is scoped to the viewer's Levels; own assignments and requests never are
            $query->whereIn('category', $levels);
        }

        SearchTerms::apply($query, $filters['search'], [
            'ticket_no', 'subject',
            SearchTerms::related('requester', ['code', ...SearchTerms::personName()]),
            SearchTerms::related('assignee', ['name', SearchTerms::related('employee', SearchTerms::personName())]),
            SearchTerms::related('relatedAsset', ['asset_code', 'tag']),
            SearchTerms::related('serviceRequest', ['reference']),
        ]);
        foreach (['status', 'category', 'priority'] as $column) {
            if ($filters[$column] !== null) {
                $query->where($column, $filters[$column]);
            }
        }

        return $query->paginate($filters['per_page']);
    }

    /**
     * Tab badges (All, My Jobs, My Tickets) in one query, ignoring the tab filters.
     *
     * @param  list<string>|null  $levels
     * @return array{open_count: int, my_jobs_count: int, my_tickets_count: int}
     */
    private function tabCounts(User $viewer, ?array $levels): array
    {
        [$mineSql, $mineBindings] = $this->requestedBy($viewer);
        [$scopeSql, $scopeBindings] = $levels === null ? [$mineSql, $mineBindings] : $this->inLevels($levels);
        $working = array_map(fn (TicketStatus $s) => $s->value, TicketStatus::working());
        $live = TicketStatus::liveValues();

        $open = "status = ? AND {$scopeSql}";
        $myJobs = 'assignee_id = ? AND status IN ('.$this->marks($working).')';
        $myTickets = "{$mineSql} AND status IN (".$this->marks($live).')';

        $row = Ticket::query()->toBase()
            ->selectRaw(
                "SUM(CASE WHEN {$open} THEN 1 ELSE 0 END) AS open_count,"
                ." SUM(CASE WHEN {$myJobs} THEN 1 ELSE 0 END) AS my_jobs_count,"
                ." SUM(CASE WHEN {$myTickets} THEN 1 ELSE 0 END) AS my_tickets_count",
                [TicketStatus::Open->value, ...$scopeBindings, $viewer->id, ...$working, ...$mineBindings, ...$live],
            )
            // Only rows any badge can count, so the indexes on status, assignee and requester apply
            ->whereRaw("({$open}) OR assignee_id = ? OR {$mineSql}", [TicketStatus::Open->value, ...$scopeBindings, $viewer->id, ...$mineBindings])
            ->first();

        return [
            'open_count' => (int) ($row->open_count ?? 0),
            'my_jobs_count' => (int) ($row->my_jobs_count ?? 0),
            'my_tickets_count' => (int) ($row->my_tickets_count ?? 0),
        ];
    }

    /** Tickets the viewer filed; an account without an employee filed none. */
    private function filedBy(Builder $query, User $viewer): void
    {
        [$sql, $bindings] = $this->requestedBy($viewer);
        $query->whereRaw($sql, $bindings);
    }

    /**
     * @return array{0: string, 1: list<int>}
     */
    private function requestedBy(User $viewer): array
    {
        return $viewer->employee_id === null ? ['0 = 1', []] : ['requester_id = ?', [$viewer->employee_id]];
    }

    /**
     * @param  list<string>  $levels
     * @return array{0: string, 1: list<string>}
     */
    private function inLevels(array $levels): array
    {
        return $levels === [] ? ['0 = 1', []] : ['category IN ('.$this->marks($levels).')', $levels];
    }

    /** @param  list<mixed>  $values */
    private function marks(array $values): string
    {
        return implode(', ', array_fill(0, count($values), '?'));
    }

    /** Newest (default), oldest, recently updated, priority high→low, or most urgent SLA first. */
    private function sort(Builder $query, string $sort): void
    {
        match ($sort) {
            'created_asc' => $query->oldest('id'),
            'updated_desc' => $query->orderByDesc('updated_at')->latest('id'),
            'priority_desc' => $query
                ->orderByRaw("CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END")
                ->latest('id'),
            'sla_due' => $query
                ->orderByRaw("CASE WHEN status IN ('completed', 'canceled') THEN 1 ELSE 0 END")
                ->orderByRaw(self::activeDue().' ASC')
                ->latest('id'),
            default => $query->latest('id'),
        };
    }

    /** The deadline of the clock a ticket currently runs against: response until taken, resolution after. */
    private static function activeDue(): string
    {
        return "CASE WHEN status = 'open' AND responded_at IS NULL THEN sla_response_due_at ELSE sla_resolve_due_at END";
    }
}
