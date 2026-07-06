<?php

namespace App\Services\Contract;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class ContractService
{
    /**
     * Create a contract from validated data.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Contract
    {
        $assetIds = $this->pullAssetIds($data);
        $contract = Contract::create($this->withoutBlankCode($data));
        $this->syncAssets($contract, $assetIds);

        return $contract;
    }

    /**
     * Update an existing contract.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Contract $contract, array $data): Contract
    {
        $assetIds = $this->pullAssetIds($data);
        $contract->update($this->withoutBlankCode($data));
        $this->syncAssets($contract, $assetIds);

        return $contract->fresh();
    }

    /**
     * Pull the (optional) asset_ids out of the payload so they don't reach the
     * Contract model. Returns null when not provided (links left untouched), or a
     * de-duplicated list of ids otherwise.
     *
     * @param  array<string, mixed>  $data
     * @return list<int>|null
     */
    private function pullAssetIds(array &$data): ?array
    {
        if (! array_key_exists('asset_ids', $data)) {
            return null;
        }

        $ids = $data['asset_ids'];
        unset($data['asset_ids']);

        return is_array($ids) ? array_values(array_unique(array_map('intval', $ids))) : [];
    }

    /**
     * Sync which assets point at this contract (asset.contract_id). Detaches assets
     * that were unselected and attaches selected ones — but only assets that are
     * currently free or already this contract's, so links are never stolen from
     * another contract. Passing null leaves all existing links untouched.
     *
     * @param  list<int>|null  $assetIds
     */
    private function syncAssets(Contract $contract, ?array $assetIds): void
    {
        if ($assetIds === null) {
            return;
        }

        // Detach assets currently linked here but no longer selected ([0] sentinel
        // detaches all when the selection is empty).
        Asset::where('contract_id', $contract->id)
            ->whereNotIn('id', $assetIds ?: [0])
            ->update(['contract_id' => null]);

        // Attach the selected, link-free (or already-ours) assets.
        if ($assetIds !== []) {
            Asset::whereIn('id', $assetIds)
                ->where(fn ($q) => $q->whereNull('contract_id')->orWhere('contract_id', $contract->id))
                ->update(['contract_id' => $contract->id]);
        }
    }

    /**
     * Drop a blank "code" so create falls back to auto-generation and update
     * keeps the existing contract number rather than nulling it.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withoutBlankCode(array $data): array
    {
        if (blank($data['code'] ?? null)) {
            unset($data['code']);
        }

        return $data;
    }

    /**
     * Renew a contract by extending its end date forward by the given number of
     * months from whichever is later: today or the current end date. Used by the
     * "Renew" action in the detail drawer.
     */
    public function renew(Contract $contract, int $months = 12): Contract
    {
        $base = $contract->end_date->isPast() ? Carbon::now() : $contract->end_date;
        $contract->update([
            'start_date' => $contract->end_date,
            'end_date' => $base->copy()->addMonths($months),
        ]);

        return $contract->fresh();
    }

    /**
     * Bulk-import contracts from parsed CSV rows. Validates all rows first;
     * returns errors (all-or-nothing) or persists and returns the imported count.
     *
     * @param  array<int, array<string, string>>  $rows
     * @return array{errors: list<array{row:int,message:string}>, imported: int}
     */
    public function importRows(array $rows): array
    {
        $valid = true;
        $errors = [];
        $types = ['software', 'hardware', 'service', 'connectivity', 'other'];
        $cycles = ['monthly', 'quarterly', 'yearly'];
        // Map lowercased vendor name → id so the CSV (still name-based) resolves to the FK.
        $vendorIdByName = Vendor::pluck('id', 'name')->mapWithKeys(fn ($id, $name) => [strtolower($name) => $id])->all();
        $validVendors = array_keys($vendorIdByName);

        foreach ($rows as $i => $row) {
            $n = $i + 2; // 1-based + header row
            foreach (['vendor', 'name', 'type', 'start_date', 'end_date', 'value', 'billing_cycle'] as $col) {
                if (blank($row[$col] ?? null)) {
                    $errors[] = ['row' => $n, 'message' => "คอลัมน์ '{$col}' จำเป็นต้องกรอก"];
                    $valid = false;
                }
            }
            if (! blank($row['vendor'] ?? null) && ! in_array(strtolower(trim($row['vendor'])), $validVendors, true)) {
                $errors[] = ['row' => $n, 'message' => "vendor '{$row['vendor']}' ไม่พบในระบบ Master Data กรุณาเพิ่มก่อนนำเข้า"];
                $valid = false;
            }
            if (! blank($row['type'] ?? null) && ! in_array($row['type'], $types, true)) {
                $errors[] = ['row' => $n, 'message' => 'type ต้องเป็น: '.implode(', ', $types)];
                $valid = false;
            }
            if (! blank($row['billing_cycle'] ?? null) && ! in_array($row['billing_cycle'], $cycles, true)) {
                $errors[] = ['row' => $n, 'message' => 'billing_cycle ต้องเป็น: '.implode(', ', $cycles)];
                $valid = false;
            }
            if (! blank($row['value'] ?? null) && ! is_numeric($row['value'])) {
                $errors[] = ['row' => $n, 'message' => 'value ต้องเป็นตัวเลข'];
                $valid = false;
            }
        }

        if (! $valid) {
            return ['errors' => $errors, 'imported' => 0];
        }

        foreach ($rows as $row) {
            $data = [
                'vendor_id' => $vendorIdByName[strtolower(trim($row['vendor']))],
                'name' => trim($row['name']),
                'type' => $row['type'],
                'start_date' => $row['start_date'],
                'end_date' => $row['end_date'],
                'value' => (float) $row['value'],
                'billing_cycle' => $row['billing_cycle'],
                'auto_renew' => in_array(strtolower(trim($row['auto_renew'] ?? '')), ['1', 'true', 'yes'], true),
                'notes' => blank($row['notes'] ?? null) ? null : trim($row['notes']),
                'notify_60' => true,
                'notify_30' => true,
                'notify_7' => true,
            ];
            if (! blank($row['code'] ?? null)) {
                $data['code'] = trim($row['code']);
            }
            Contract::create($data);
        }

        return ['errors' => [], 'imported' => count($rows)];
    }

    /**
     * Toggle a contract's cancelled state: cancel an active contract, or
     * reactivate one that was previously cancelled. Used by the detail drawer.
     */
    public function toggleCancel(Contract $contract): Contract
    {
        // Guard only the active → cancelled transition; reactivation is always allowed.
        if ($contract->cancelled_at === null) {
            $this->assertCancellable($contract);
        }

        $contract->update([
            'cancelled_at' => $contract->cancelled_at === null ? Carbon::now() : null,
        ]);

        return $contract->fresh();
    }

    /**
     * A Hardware contract can only be cancelled once every linked asset has been
     * written off — otherwise leased hardware would be left tracked against a dead
     * contract. Other contract types carry no such restriction.
     *
     * @throws ValidationException
     */
    private function assertCancellable(Contract $contract): void
    {
        if ($contract->type !== ContractType::Hardware) {
            return;
        }

        $pending = $contract->assets()->where('status', '!=', AssetStatus::Writeoff->value)->count();

        if ($pending > 0) {
            throw ValidationException::withMessages([
                'contract' => "All {$pending} linked asset(s) must be written off before this hardware contract can be cancelled.",
            ]);
        }
    }
}
