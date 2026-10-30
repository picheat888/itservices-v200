<?php

// Asset choices for the Take Case dialog: the requester's own devices, or any asset found by typing.

namespace App\Services\Ticket;

use App\Models\Asset\Asset;
use App\Models\Ticket\Ticket;
use App\Support\SearchTerms;
use Illuminate\Support\Collection;

class TicketAssetPickerService
{
    /**
     * Assets the ticket's requester holds now, latest handover first.
     *
     * @return Collection<int, array{id: int, asset_code: string, model: ?string}>
     */
    public function heldByRequester(Ticket $ticket): Collection
    {
        return Asset::query()
            ->with('model')
            ->where('owner_employee_id', $ticket->requester_id)
            ->orderByDesc('owned_since')
            ->get()
            ->map(fn (Asset $a) => $this->option($a));
    }

    /**
     * Any asset matching the same search as the asset list, 20 at a time.
     *
     * @return Collection<int, array{id: int, asset_code: string, model: ?string}>
     */
    public function search(mixed $search): Collection
    {
        $query = Asset::query()->with('model')->latest('id');
        SearchTerms::apply($query, $search, [
            'asset_code', 'tag', 'serial',
            SearchTerms::related('model', ['name']),
            'owner',
            SearchTerms::related('ownerEmployee', ['code', ...SearchTerms::personName()]),
        ]);

        return $query->limit(20)->get()->map(fn (Asset $a) => $this->option($a));
    }

    /** @return array{id: int, asset_code: string, model: ?string} */
    private function option(Asset $asset): array
    {
        return [
            'id' => $asset->id,
            'asset_code' => $asset->asset_code,
            'model' => $asset->model?->name,
        ];
    }
}
