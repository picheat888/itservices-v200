<?php

namespace App\Services\Asset;

use App\Enums\Asset\AssetSource;
use App\Models\Asset\Asset;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Collection;

/**
 * The two "highest value" tables on the Assets overview: bought assets by purchase price, and open leases by
 * yearly rent. Both read from the in-service assets the summary has already loaded.
 */
class AssetTopValueService
{
    private const LIMIT = 5;

    /**
     * The five dearest bought assets still in service, by purchase price.
     *
     * @param  Collection<int, Asset>  $inService
     * @return Collection<int, Asset>
     */
    public function topPurchased(Collection $inService): Collection
    {
        return $inService->where('source', AssetSource::Purchased)
            ->sortByDesc(fn (Asset $a) => (float) $a->value)
            ->take(self::LIMIT)
            ->values();
    }

    /**
     * The five open leases with the highest yearly rent that still cover an asset in service.
     *
     * @param  Collection<int, Asset>  $inService  loaded with contract.vendor
     * @return list<array{contract_id: int, asset_id: int, code: string, vendor: ?string, vendor_th: ?string, assets_count: int, value_display: string, billing_cycle: string}>
     */
    public function topRented(Collection $inService): array
    {
        return $inService->where('source', AssetSource::Rented)
            ->filter(fn (Asset $a) => $a->contract !== null && ! $a->contract->isClosed())
            ->groupBy('contract_id')
            ->map(fn (Collection $leased) => ['contract' => $leased->first()->contract, 'assets' => $leased])
            ->sortByDesc(fn (array $lease) => $lease['contract']->annualValue())
            ->take(self::LIMIT)
            ->map(fn (array $lease) => [
                'contract_id' => $lease['contract']->id,
                'asset_id' => $lease['assets']->first()->id,
                'code' => $lease['contract']->code,
                'vendor' => $lease['contract']->vendor?->name,
                'vendor_th' => $lease['contract']->vendor?->name_th,
                'assets_count' => $lease['assets']->count(),
                'value_display' => AppSetting::money((float) $lease['contract']->value),
                'billing_cycle' => $lease['contract']->billing_cycle,
            ])
            ->values()
            ->all();
    }
}
