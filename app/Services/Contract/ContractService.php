<?php

namespace App\Services\Contract;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Support\Refusal;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ContractService
{
    public function __construct(private readonly ContractExpiryAlertService $alerts) {}

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
     * Update an existing contract. A new end date is a renewal: its reminders start over.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Contract $contract, array $data): Contract
    {
        if ($contract->isClosed()) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        $this->assertKeepsRetiredAssets($contract, $data);
        $endBefore = $contract->end_date;
        $assetIds = $this->pullAssetIds($data);
        $contract->update($this->withoutBlankCode($data));
        $this->syncAssets($contract, $this->assetIdsForType($contract, $assetIds));

        $contract = $contract->fresh();
        if (! $contract->end_date->isSameDay($endBefore)) {
            $this->alerts->resetForContract($contract);
        }

        return $contract;
    }

    /**
     * A hardware contract that holds assets already returned to the lessor or written off stays a
     * hardware contract: switching the type would have to unlink every asset, and those are kept
     * on the contract for good (syncAssets) as its record of what came back.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws ValidationException
     */
    private function assertKeepsRetiredAssets(Contract $contract, array $data): void
    {
        $nextType = $data['type'] ?? null;
        $nextType = $nextType instanceof ContractType ? $nextType : ContractType::tryFrom((string) $nextType);
        if ($contract->type !== ContractType::Hardware || $nextType === null || $nextType === ContractType::Hardware) {
            return;
        }

        $retired = $contract->assets()->where('status', AssetStatus::Writeoff->value)->count();
        if ($retired > 0) {
            throw ValidationException::withMessages([
                'type' => "This contract holds {$retired} asset(s) already returned or written off, so it stays a hardware contract.",
            ]);
        }
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
     * A written-off asset (returned to the lessor or written off) is never detached: it is the
     * contract's record of what came back, and the write-off report counts it against the
     * contract. Leaving it out of the selection keeps it linked.
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
            ->where('status', '!=', AssetStatus::Writeoff->value)
            ->update(['contract_id' => null, 'updated_by' => Auth::id()]);

        // Attach the selected, link-free, not written-off assets (already-ours ones are left alone,
        // so editing a contract does not stamp every asset it holds as just changed).
        if ($assetIds !== []) {
            Asset::whereIn('id', $assetIds)
                ->whereNull('contract_id')
                ->where('status', '!=', AssetStatus::Writeoff->value)
                ->update(['contract_id' => $contract->id, 'updated_by' => Auth::id()]);
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
        // A second cancel would overwrite who cancelled it and why
        if ($contract->cancelled_at !== null || $contract->expired_at !== null) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        // Cancel ends a running term early (the end date included); an overdue one is expired instead
        if ($contract->isOverdue()) {
            Refusal::fail('term_ended', field: 'contract');
        }

        $this->assertNoPendingAssets($contract);

        $contract->update([
            'cancelled_at' => Carbon::now(),
            'cancel_reason' => $reason,
        ]);
        $this->alerts->resetForContract($contract);

        return $contract->fresh();
    }

    /**
     * Reactivate a cancelled or expired contract — reopens it by clearing whichever
     * lifecycle timestamp is set (cancelled_at / expired_at) plus the cancel reason,
     * so the contract returns to its date-derived active/overdue state.
     */
    public function reactivate(Contract $contract): Contract
    {
        if ($contract->cancelled_at === null && $contract->expired_at === null) {
            throw ValidationException::withMessages([
                'contract' => 'Only a cancelled or expired contract can be reactivated.',
            ]);
        }

        $contract->update([
            'cancelled_at' => null,
            'cancel_reason' => null,
            'expired_at' => null,
        ]);
        $this->alerts->resetForContract($contract);

        return $contract->fresh();
    }

    /**
     * Mark a contract as expired — the admin close-out once its term has ended; contracts.reactivate
     * can reopen it. Every linked asset must be written off first.
     *
     * @throws ValidationException
     */
    public function expire(Contract $contract): Contract
    {
        if ($contract->expired_at !== null) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        // Close-out once the term has ended (the day after the end date); a running one is cancelled instead
        if ($contract->daysRemaining() >= 0) {
            Refusal::fail('term_running', field: 'contract');
        }

        $this->assertNoPendingAssets($contract);

        $contract->update(['expired_at' => Carbon::now()]);
        $this->alerts->resetForContract($contract);

        return $contract->fresh();
    }

    /**
     * Hard-delete a contract added by mistake: only a running one (not overdue, cancelled or
     * expired) with no linked assets. Anything past that is closed with cancel or expire instead.
     * The attachment rows go with the contract (cascade); their files are removed here.
     *
     * @throws ValidationException
     */
    public function delete(Contract $contract): void
    {
        if ($contract->status !== 'active') {
            Refusal::fail('not_deletable', field: 'contract');
        }
        if ($contract->assets()->exists()) {
            Refusal::fail('assets_linked', field: 'contract');
        }

        $this->alerts->resetForContract($contract);

        $paths = $contract->attachments()->pluck('path')->all();
        if ($paths !== []) {
            Storage::disk('local')->delete($paths);
        }
        $contract->delete();
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
            Refusal::fail('assets_pending', ['pending' => $pending], 'contract');
        }
    }
}
