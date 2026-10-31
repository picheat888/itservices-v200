<?php

namespace App\Services\Contract;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Support\Refusal;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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
     * Update an open contract; a new end date is a renewal, so its reminders start over.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Contract $contract, array $data): Contract
    {
        if ($contract->isClosed()) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        $this->assertKeepsRetiredAssets($contract, $data);
        $endBefore = $contract->getOriginal('end_date');
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
     * A hardware contract holding written-off assets stays hardware: those links are kept for good.
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
     * Only hardware holds assets: other types detach all ([]); null leaves the links untouched.
     *
     * @param  list<int>|null  $assetIds
     * @return list<int>|null
     */
    private function assetIdsForType(Contract $contract, ?array $assetIds): ?array
    {
        return $contract->type === ContractType::Hardware ? $assetIds : [];
    }

    /**
     * Take asset_ids out of the payload: null when not sent, otherwise unique ids.
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
     * Link the selected free assets and unlink the rest; written-off assets are never moved either way.
     *
     * @param  list<int>|null  $assetIds
     */
    private function syncAssets(Contract $contract, ?array $assetIds): void
    {
        if ($assetIds === null) {
            return;
        }

        // Unlink ([0] sentinel unlinks all when nothing is selected)
        Asset::where('contract_id', $contract->id)
            ->whereNotIn('id', $assetIds ?: [0])
            ->where('status', '!=', AssetStatus::Writeoff->value)
            ->update(['contract_id' => null, 'updated_by' => Auth::id()]);

        // Link only free ones, so another contract's assets are never taken and ours are not restamped
        if ($assetIds !== []) {
            Asset::whereIn('id', $assetIds)
                ->whereNull('contract_id')
                ->where('status', '!=', AssetStatus::Writeoff->value)
                ->update(['contract_id' => $contract->id, 'updated_by' => Auth::id()]);
        }
    }

    /**
     * A blank code means auto-number on create and keep the number on update.
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
     * End a running contract early (its end date included), once its assets are written off.
     *
     * @throws ValidationException
     */
    public function cancel(Contract $contract, string $reason): Contract
    {
        // A second cancel would overwrite who cancelled it and why
        if ($contract->cancelled_at !== null || $contract->expired_at !== null) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        // An overdue one is expired instead
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
     * Reopen a cancelled or expired contract; it goes back to its date-derived state.
     *
     * @throws ValidationException
     */
    public function reactivate(Contract $contract): Contract
    {
        if (! $contract->isClosed()) {
            Refusal::fail('not_closed', field: 'contract');
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
     * Close out a contract once its term has ended (from the day after the end date).
     *
     * @throws ValidationException
     */
    public function expire(Contract $contract): Contract
    {
        if ($contract->expired_at !== null) {
            Refusal::fail('contract_closed', field: 'contract');
        }

        // A running one is cancelled instead
        if ($contract->daysRemaining() >= 0) {
            Refusal::fail('term_running', field: 'contract');
        }

        $this->assertNoPendingAssets($contract);

        $contract->update(['expired_at' => Carbon::now()]);
        $this->alerts->resetForContract($contract);

        return $contract->fresh();
    }

    /**
     * Hard-delete a running contract with no linked assets, then its attachment files.
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

        $paths = $contract->attachments()->pluck('path')->all();

        DB::transaction(function () use ($contract) {
            $this->alerts->resetForContract($contract);
            $contract->delete();
            AuditLog::recordDeleted('Deleted contract', "{$contract->name} ({$contract->code})", $contract);
        });

        // Files go only once the rows are gone for good
        if ($paths !== []) {
            Storage::disk('local')->delete($paths);
        }
    }

    /**
     * Closing needs every linked asset written off first, so no live asset points at a closed contract.
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
