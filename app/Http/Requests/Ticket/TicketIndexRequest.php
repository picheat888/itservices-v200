<?php

// The ticket list's query string: tab scope, search, filters, sort and page size.

namespace App\Http\Requests\Ticket;

use App\Http\Resources\Ticket\TicketResource;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class TicketIndexRequest extends FormRequest
{
    /** My Tickets (?requested=1) has its own gate so the tab can be granted per role. */
    public function authorize(): bool
    {
        return ! $this->boolean('requested') || (bool) $this->user()?->hasPermission('tickets.my');
    }

    protected function failedAuthorization(): void
    {
        abort(403);
    }

    /**
     * Unknown values fall back rather than fail, so a hand-edited URL still lists tickets.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Priority and the SLA clocks are only shown to whoever can take a case, so a hand-typed
     * ?sort=priority_desc, ?sla= or ?priority= from anyone else is ignored.
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
            'per_page' => max(5, min(100, (int) $this->query('per_page', 20))),
        ];
    }
}
