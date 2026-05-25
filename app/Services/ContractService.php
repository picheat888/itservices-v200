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
