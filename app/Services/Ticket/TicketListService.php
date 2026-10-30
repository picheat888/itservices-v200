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
    /**
     * IT staff (tickets.view_all) see every ticket in the categories their Level grants; everyone
     * else sees only what they requested. "mine" narrows to the viewer's assignments, "requested"
     * to what they filed.
     *
     * @param  array{requested: bool, mine: bool, sort: string, over_sla: bool, search: mixed, status: mixed, category: mixed, priority: mixed, per_page: int}  $filters
     */
    public function paginate(User $viewer, array $filters): LengthAwarePaginator
    {
        $query = Ticket::query()->with(['requester', 'assignee.employee', 'relatedAsset.category', 'relatedAsset.brand', 'relatedAsset.model', 'attachments', 'serviceRequest']);

        if ($filters['requested']) {
            $query->where('requester_id', $viewer->employee_id);
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

        if (! $this->canViewAll($viewer)) {
            $query->where('requester_id', $viewer->employee_id);
        } elseif (! $filters['mine'] && ! $filters['requested']) {
            // The all-tickets tab is scoped to the viewer's Levels; own assignments and requests never are
            $query->whereIn('category', Permissions::ticketLevelsFor($viewer));
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
     * Tab badges, ignoring the tab filters so they never shift with them: open tickets in the
     * viewer's scope (All), their unfinished assignments (My Jobs) and unresolved requests (My Tickets).
     *
     * @return array{open_count: int, my_jobs_count: int, my_tickets_count: int}
     */
    public function tabCounts(User $viewer): array
    {
        return [
            'open_count' => Ticket::query()
                ->when(
                    $this->canViewAll($viewer),
                    fn ($q) => $q->whereIn('category', Permissions::ticketLevelsFor($viewer)),
                    fn ($q) => $q->where('requester_id', $viewer->employee_id),
                )
                ->where('status', TicketStatus::Open)
                ->count(),
            'my_jobs_count' => Ticket::query()
                ->where('assignee_id', $viewer->id)
                ->whereIn('status', TicketStatus::working())
                ->count(),
            'my_tickets_count' => Ticket::query()
                ->where('requester_id', $viewer->employee_id)
                ->whereIn('status', TicketStatus::live())
                ->count(),
        ];
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

    private function canViewAll(User $viewer): bool
    {
        return $viewer->hasPermission('tickets.view_all');
    }
}
