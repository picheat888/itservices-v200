<?php

namespace App\Services\Contract;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
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
        $this->syncAssets($contract, $this->assetIdsForType($contract, $assetIds));

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
        $this->syncAssets($contract, $this->assetIdsForType($contract, $assetIds));

        return $contract->fresh();
    }

    /**
     * Only hardware contracts may hold assets. For any other type this forces a
     * full detach ([]) regardless of what was submitted; hardware keeps the
     * caller's selection (null = leave existing links untouched).
     *
     * @param  list<int>|null  $assetIds
     * @return list<int>|null
     */
    private function assetIdsForType(Contract $contract, ?array $assetIds): ?array
    {
        return $contract->type === ContractType::Hardware ? $assetIds : [];
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
     * Cancel a contract — early termination while it's still running. Only valid
     * before the term ends (an overdue contract can only be expired), and every
     * linked asset must be written off first.
     *
     * @throws ValidationException
     */
    public function cancel(Contract $contract, string $reason): Contract
    {
        // Cancel = early termination — only valid while the contract is still
        // running. Once the term has ended (overdue) it can only be expired.
        if ($contract->daysRemaining() <= 0) {
            throw ValidationException::withMessages([
                'contract' => 'This contract term has already ended; mark it as expired instead of cancelling.',
            ]);
        }

        $this->assertNoPendingAssets($contract);

        $contract->update([
            'cancelled_at' => Carbon::now(),
            'cancel_reason' => $reason,
        ]);

        return $contract->fresh();
    }

    /**
     * Reactivate a cancelled or expired contract — reopens it by clearing whichever
     * lifecycle timestamp is set (cancelled_at / expired_at) plus the cancel reason,
     * so the contract returns to its date-derived active/overdue state.
     */
    public function reactivate(Contract $contract): Contract
    {
        $contract->update([
            'cancelled_at' => null,
            'cancel_reason' => null,
            'expired_at' => null,
        ]);

        return $contract->fresh();
    }

    /**
     * Mark a contract as expired — a permanent, admin-driven close-out. Unlike
     * cancel this cannot be undone. Every linked asset must be written off first.
     *
     * @throws ValidationException
     */
    public function expire(Contract $contract): Contract
    {
        if ($contract->expired_at !== null) {
            throw ValidationException::withMessages([
                'contract' => 'This contract has already been marked as expired.',
            ]);
        }

        // Expire = end-of-term close-out — only once the contract term has ended.
        // A still-running contract is ended early via cancel, not expire.
        if ($contract->daysRemaining() > 0) {
            throw ValidationException::withMessages([
                'contract' => 'This contract term has not ended yet; cancel it instead of marking it expired.',
            ]);
        }

        $this->assertNoPendingAssets($contract);

        $contract->update(['expired_at' => Carbon::now()]);

        return $contract->fresh();
    }

    /**
     * A contract with linked assets can only be closed (cancelled or expired)
     * once every linked asset has been written off — otherwise tracked hardware
     * would be left pointing at a dead contract. Applies to all contract types.
     *
     * @throws ValidationException
     */
    private function assertNoPendingAssets(Contract $contract): void
    {
        $pending = $contract->assets()->where('status', '!=', AssetStatus::Writeoff->value)->count();

        if ($pending > 0) {
            throw ValidationException::withMessages([
                'contract' => "All {$pending} linked asset(s) must be written off before this contract can be closed.",
            ]);
        }
    }
}
