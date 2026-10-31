<?php

// The ticket list's query string: tab scope, search, filters, sort and page size.

namespace App\Http\Requests\Ticket;

use App\Http\Requests\Permission\GatedPermissionRequest;
use App\Http\Resources\Ticket\TicketResource;
use App\Support\PerPage;

class TicketIndexRequest extends GatedPermissionRequest
{
    // Only My Tickets (?requested=1) has a gate of its own
    protected function gate(): string
    {
        return 'tickets.my';
    }

    public function authorize(): bool
    {
        return ! $this->boolean('requested') || parent::authorize();
    }

    /**
     * Priority and SLA sorts and filters only count for readers who can see them.
     *
     * @return array{requested: bool, mine: bool, sort: string, over_sla: bool, search: mixed, status: mixed, category: mixed, priority: mixed, per_page: int}
     */
    public function filters(): array
    {
        $canSeeInternals = TicketResource::showsDeskInternals($this);
        $sort = (string) $this->query('sort');
        if (! $canSeeInternals && in_array($sort, ['priority_desc', 'sla_due'], true)) {
            $sort = '';
        }

        return [
            'requested' => $this->boolean('requested'),
            'mine' => $this->boolean('mine'),
            'sort' => $sort,
            'over_sla' => $canSeeInternals && $this->query('sla') === 'over_sla',
            'search' => $this->query('search'),
            'status' => $this->filled('status') ? $this->query('status') : null,
            'category' => $this->filled('category') ? $this->query('category') : null,
            'priority' => $canSeeInternals && $this->filled('priority') ? $this->query('priority') : null,
            // Floor 5, not 10: the overview's "Latest" card asks for five rows
            'per_page' => PerPage::from($this, min: 5),
        ];
    }
}
