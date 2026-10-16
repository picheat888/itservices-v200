<?php

namespace App\Services\Dashboard;

use App\Models\Contract\Contract;

/**
 * The "expiring soon" tile, counted the Contracts list's way (each contract's own reminder window).
 */
class ContractsBlock
{
    private const SOON_DAYS = 30;

    /**
     * @return array{expiring: array{total: int, d30: int, d31_plus: int, overdue: int}}
     */
    public function build(): array
    {
        $live = Contract::query()->whereNull('cancelled_at')->whereNull('expired_at')->get();
        $expiring = $live->filter(fn (Contract $contract) => $contract->isInReminder());
        $soon = $expiring->filter(fn (Contract $contract) => $contract->daysRemaining() <= self::SOON_DAYS)->count();

        return [
            'expiring' => [
                'total' => $expiring->count(),
                'd30' => $soon,
                'd31_plus' => $expiring->count() - $soon,
                'overdue' => $live->filter(fn (Contract $contract) => $contract->daysRemaining() <= 0)->count(),
            ],
        ];
    }
}
