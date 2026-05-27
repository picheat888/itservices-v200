<?php

namespace App\Services;

use App\Models\Contract;
use Illuminate\Support\Carbon;

class ContractService
{
    /**
     * Create a contract from validated data.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Contract
    {
        return Contract::create($this->withoutBlankCode($data));
    }

    /**
     * Update an existing contract.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Contract $contract, array $data): Contract
    {
        $contract->update($this->withoutBlankCode($data));

        return $contract->fresh();
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

        foreach ($rows as $i => $row) {
            $n = $i + 2; // 1-based + header row
            foreach (['vendor', 'name', 'type', 'start_date', 'end_date', 'value', 'billing_cycle'] as $col) {
                if (blank($row[$col] ?? null)) {
                    $errors[] = ['row' => $n, 'message' => "คอลัมน์ '{$col}' จำเป็นต้องกรอก"];
                    $valid = false;
                }
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
                'vendor' => trim($row['vendor']),
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
        $contract->update([
            'cancelled_at' => $contract->cancelled_at === null ? Carbon::now() : null,
        ]);

        return $contract->fresh();
    }
}
