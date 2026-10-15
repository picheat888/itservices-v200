<?php

namespace App\Services\Report\Contract;

use App\Models\Contract\Contract;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Scheduled billing for the contract reports: the monthly and yearly cost of a contract and the
 * dates its bills fall on (start + k × cycle, before end_date). Scheduled values only — the
 * system records no payments.
 */
final class ContractBilling
{
    /** Months one billing period covers. */
    public const MONTHS_PER_CYCLE = ['monthly' => 1, 'quarterly' => 3, 'yearly' => 12];

    public static function monthsPerCycle(Contract $contract): int
    {
        return self::MONTHS_PER_CYCLE[$contract->billing_cycle] ?? 12;
    }

    public static function monthlyCost(Contract $contract): float
    {
        return $contract->annualValue() / 12;
    }

    /** Same figure as the /contracts "Annual value" (Contract::annualValue). */
    public static function yearlyCost(Contract $contract): float
    {
        return $contract->annualValue();
    }

    /**
     * Bill dates from $from (inclusive) to $to (exclusive), never on or after end_date.
     *
     * @return list<CarbonImmutable>
     */
    public static function billDates(Contract $contract, CarbonInterface $from, CarbonInterface $to): array
    {
        $start = CarbonImmutable::parse($contract->start_date)->startOfDay();
        $end = CarbonImmutable::parse($contract->end_date)->startOfDay();
        $step = self::monthsPerCycle($contract);
        $dates = [];

        for ($k = 0; ; $k++) {
            $date = $start->addMonthsNoOverflow($k * $step);
            if ($date->gte($end) || $date->gte($to)) {
                break;
            }
            if ($date->gte($from)) {
                $dates[] = $date;
            }
        }

        return $dates;
    }

    /** What is still scheduled from $from to end_date: remaining bills × value. */
    public static function remainingValue(Contract $contract, CarbonInterface $from): float
    {
        $end = CarbonImmutable::parse($contract->end_date)->startOfDay();

        return count(self::billDates($contract, $from, $end)) * (float) $contract->value;
    }
}
