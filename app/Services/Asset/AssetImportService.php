<?php

// Imports a checked batch of assets all or nothing: re-check, then one code lock and one transaction.

namespace App\Services\Asset;

use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\User;
use App\Support\Refusal;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AssetImportService
{
    private const FIELDS = [
        'category_id', 'brand_id', 'model_id', 'serial', 'warehouse_id', 'asset_code', 'tag', 'notes',
        'value', 'vendor_id', 'purchase_date', 'warranty_end', 'warranty_lifetime',
    ];

    public function __construct(
        private readonly AssetImportChecker $checker,
        private readonly AssetService $assets,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $rows  flat rows as the preview endpoint handed them out
     * @return array{imported:int, ids:list<int>, first_code:string, last_code:string}
     */
    public function run(string $kind, array $rows, ?Contract $contract, User $by): array
    {
        $this->refuseInvalidRows($kind, $rows);
        $this->refuseClosedContract($contract);

        try {
            return Cache::lock('assets:code-sequence', 10)->block(10, fn () => DB::transaction(fn () => $this->createAll($kind, $rows, $contract)));
        } catch (UniqueConstraintViolationException) {
            Refusal::fail('import_conflict');
        }
    }

    /** @param  list<array<string, mixed>>  $rows */
    private function refuseInvalidRows(string $kind, array $rows): void
    {
        $invalid = $this->checker->recheck($kind, $rows);
        if ($invalid !== []) {
            $errors = array_map(fn (array $row) => ['row' => $row['line'], 'issues' => $row['issues']], $invalid);
            Refusal::fail('import_rows_invalid', ['errors' => $errors]);
        }
    }

    private function refuseClosedContract(?Contract $contract): void
    {
        if ($contract === null) {
            return;
        }
        $open = Contract::query()
            ->whereKey($contract->getKey())
            ->where('type', ContractType::Hardware->value)
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->exists();
        if (! $open) {
            Refusal::fail('link_contract_not_open', field: 'contract_id');
        }
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array{imported:int, ids:list<int>, first_code:string, last_code:string}
     */
    private function createAll(string $kind, array $rows, ?Contract $contract): array
    {
        usort($rows, fn (array $a, array $b) => $a['line'] <=> $b['line']);

        // Codes typed in the batch are kept; blank rows take the next free ones
        $typed = array_values(array_filter(array_map(fn (array $row) => trim((string) ($row['asset_code'] ?? '')), $rows)));
        $issued = Asset::nextFreeCodes(count($rows) - count($typed), $typed);

        $ids = [];
        $codes = [];
        foreach ($rows as $row) {
            $values = array_intersect_key($row, array_flip(self::FIELDS));
            $values['asset_code'] = trim((string) ($values['asset_code'] ?? '')) ?: array_shift($issued);

            $asset = $this->assets->create($values + ['source' => $kind, 'contract_id' => $contract?->getKey()]);
            AuditLog::record('Registered asset', "{$asset->asset_code} - {$asset->model?->name}", subject: $asset);

            $ids[] = $asset->id;
            $codes[] = $asset->asset_code;
        }

        return ['imported' => count($ids), 'ids' => $ids, 'first_code' => $codes[0], 'last_code' => $codes[count($codes) - 1]];
    }
}
