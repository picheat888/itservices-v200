<?php

// The contract list page: sort (closed contracts last), search, type and the expiring / expired tabs.

namespace App\Services\Contract;

use App\Enums\Asset\AssetStatus;
use App\Models\Contract\Contract;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ContractListService
{
    /** @param  array{sort: mixed, search: mixed, type: mixed, tab: mixed, per_page: int}  $filters */
    public function page(array $filters): LengthAwarePaginator
    {
        $query = Contract::query()
            ->with('vendor')
            ->withCount([
                'assets',
                'assets as open_assets_count' => fn ($assets) => $assets->where('status', '!=', AssetStatus::Writeoff->value),
            ]);

        // Cancelled and expired contracts sink to the bottom whatever the sort
        match ($filters['sort']) {
            'end_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'desc'),
            'created_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'desc'),
            'created_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'asc'),
            'value_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'desc'),
            'value_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'asc'),
            default => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'asc'),
        };
        // Tie-breaker so equal dates or values never swap or repeat across pages
        $query->orderBy('id');

        SearchTerms::apply($query, $filters['search'], [
            'code', 'name', 'details',
            SearchTerms::related('vendor', ['name', 'name_th']),
        ]);

        if ($filters['type'] !== null) {
            $query->where('type', $filters['type']);
        }

        if ($filters['tab'] === 'expiring') {
            $query->expiring();
        }

        if ($filters['tab'] === 'expired') {
            $query->expired();
        }

        return $query->paginate($filters['per_page']);
    }
}
