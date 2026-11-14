<?php

// Actions on many assets at once, and delete: each runs with its audit rows in one transaction, one row per asset.

namespace App\Services\Asset;

use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Settings\Location;
use App\Models\Settings\WriteoffReason;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AssetBulkActionService
{
    public function __construct(
        private readonly AssetService $assets,
        private readonly AssetActionGuard $guard,
    ) {}

    /**
     * Writes off every asset with a reason from Settings -> Assets (and an optional note). Returns how many changed.
     *
     * @param  list<int>  $ids
     */
    public function writeOff(array $ids, int $reasonId, ?string $note): int
    {
        return DB::transaction(function () use ($ids, $reasonId, $note) {
            $count = $this->assets->bulkSetStatus($ids, AssetStatus::Writeoff, $note, $reasonId);
            $reasonName = WriteoffReason::whereKey($reasonId)->value('name');
            foreach (Asset::whereIn('id', $ids)->get() as $asset) {
                AuditLog::record('Wrote off asset', $asset->asset_code, ['facts' => array_filter(['reason' => $reasonName, 'note' => $note])], subject: $asset);
            }

            return $count;
        });
    }

    /**
     * Returns rented assets to their lessor. Returns how many changed.
     *
     * @param  list<int>  $ids
     */
    public function returnToVendor(array $ids, ?string $note): int
    {
        return DB::transaction(function () use ($ids, $note) {
            $count = $this->assets->returnToVendor($ids, $note);
            foreach (Asset::with('contract:id,code')->whereIn('id', $ids)->get() as $asset) {
                AuditLog::record(
                    'Returned asset to lessor',
                    $asset->asset_code,
                    ['facts' => array_filter(['contract' => $asset->contract?->code, 'note' => $note])],
                    subject: $asset,
                );
            }

            return $count;
        });
    }

    /**
     * Moves in-use assets to a location; the ones already there are skipped. Returns the assets that moved.
     *
     * @param  Collection<int, Asset>  $assets
     * @return Collection<int, Asset>
     */
    public function relocate(Collection $assets, Location $location, User $actor, ?string $note): Collection
    {
        return DB::transaction(function () use ($assets, $location, $actor, $note) {
            $moved = $this->assets->relocateMany($assets, $location, $actor, $note);
            foreach ($moved as $asset) {
                AuditLog::record('Updated asset location', "{$asset->asset_code} → {$location->name}", subject: $asset);
            }

            return $moved;
        });
    }

    /**
     * Puts rented assets that have no contract onto one contract. Returns how many were linked.
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function linkContract(Collection $assets, Contract $contract): int
    {
        return DB::transaction(function () use ($assets, $contract) {
            // Re-read under lock: one linked by someone else since the request's check is refused, not overwritten
            $assets = Asset::whereKey($assets->map(fn (Asset $a) => $a->getKey())->all())->lockForUpdate()->get();
            $this->guard->canLinkContract($assets)->authorize();

            foreach ($assets as $asset) {
                $asset->update(['contract_id' => $contract->id]);
                AuditLog::record('Linked asset to contract', "{$asset->asset_code} → {$contract->code}", subject: $asset);
            }

            return $assets->count();
        });
    }

    /**
     * Hands Ready assets to one owner; one bell and one mail for the recipient after the commit.
     *
     * @param  Collection<int, Asset>  $assets
     * @param  array{mode: string, owner_employee_id?: ?int, owner_label?: ?string, location_id: int, reason?: ?string}  $data
     */
    public function transfer(Collection $assets, array $data, User $actor): void
    {
        $this->assets->batchNotices(function () use ($assets, $data, $actor) {
            foreach ($assets as $asset) {
                $this->assets->transfer($asset, [
                    'mode' => $data['mode'],
                    'owner_employee_id' => $data['owner_employee_id'] ?? null,
                    'owner_label' => $data['owner_label'] ?? null,
                    'location_id' => $data['location_id'],
                    'reason' => $data['reason'] ?? null,
                ], $actor);
            }
            foreach ($assets as $asset) {
                AuditLog::record('Transferred asset', "{$asset->asset_code} → {$asset->ownerCode()}", subject: $asset);
            }
        });
    }

    /**
     * Recalls assets to a warehouse; one bell and one mail per person, each asset named normal or forced (decided before any move).
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function recall(Collection $assets, User $actor, string $warehouse, ?string $reason): void
    {
        $forcedIds = $assets->reject(fn (Asset $a) => $this->guard->isNormalRecall($a))->pluck('id')->all();
        $this->assets->batchNotices(function () use ($assets, $actor, $warehouse, $reason, $forcedIds) {
            foreach ($assets as $asset) {
                $this->assets->recall($asset, $actor, $warehouse, $reason);
                AuditLog::record(in_array($asset->id, $forcedIds, true) ? 'Force-recalled asset' : 'Recalled asset', $asset->asset_code, subject: $asset);
            }
        });
    }

    /**
     * Receives pending-return assets into a warehouse, then audits each.
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function receive(Collection $assets, User $actor, string $warehouse): void
    {
        DB::transaction(function () use ($assets, $actor, $warehouse) {
            foreach ($assets as $asset) {
                $this->assets->markReceived($asset, $actor, $warehouse);
            }
            foreach ($assets as $asset) {
                AuditLog::record('Received asset', $asset->asset_code, subject: $asset);
            }
        });
    }

    /**
     * Deletes an asset nothing depends on; the blocker payload (422) when something does.
     *
     * @return array<string, mixed>|null
     */
    public function delete(Asset $asset): ?array
    {
        $blocker = $this->assets->deletionBlocker($asset);
        if ($blocker !== null) {
            return $blocker;
        }

        DB::transaction(function () use ($asset) {
            AuditLog::recordDeleted('Deleted asset', "{$asset->asset_code} - {$asset->model?->name}", $asset);
            $asset->delete();
        });

        return null;
    }
}
