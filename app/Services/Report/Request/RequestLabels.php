<?php

namespace App\Services\Report\Request;

use App\Enums\Request\RequestType;
use App\Models\Request\ServiceRequest;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Request type / status wording shared by the request tabular reports: the i18n key the page
 * shows (the Requests module's own `req_*` keys) and the Thai label the Excel/PDF prints
 * (RequestType::labelTh(), and resources/js/lang/th/requests.ts for statuses). Date ranges
 * come from TabularReport::dayRange().
 */
trait RequestLabels
{
    private const STATUS_KEYS = [
        'pending' => 'req_status_pending', 'approved' => 'req_status_approved', 'completed' => 'req_status_completed',
        'rejected' => 'req_status_rejected', 'cancelled' => 'req_status_cancelled',
    ];

    private const STATUS_TH = [
        'pending' => 'รออนุมัติ', 'approved' => 'อนุมัติแล้ว', 'completed' => 'เสร็จสิ้น',
        'rejected' => 'ไม่อนุมัติ', 'cancelled' => 'ยกเลิก',
    ];

    // Age groups the approvals and IT pages share, worst first, in whole days
    private const AGE_BANDS = ['over_7', 'days_4_7', 'upto_3'];

    private const AGE_BAND_KEYS = ['over_7' => 'rep_age_over_7', 'days_4_7' => 'rep_age_days_4_7', 'upto_3' => 'rep_age_upto_3'];

    private const AGE_BAND_TH = ['over_7' => 'เกิน 7 วัน', 'days_4_7' => '4–7 วัน', 'upto_3' => 'ไม่เกิน 3 วัน'];

    private static function ageBand(int $days): string
    {
        return $days > 7 ? 'over_7' : ($days > 3 ? 'days_4_7' : 'upto_3');
    }

    /** Whole days from one moment to another by their dates (same day = 0); negative when `to` is earlier. */
    private static function wholeDays(CarbonInterface $from, CarbonInterface $to): int
    {
        return self::dayNumber($to) - self::dayNumber($from);
    }

    // Days since 1970-01-01 of the moment's own calendar date, without building Carbon copies
    private static function dayNumber(CarbonInterface $at): int
    {
        $year = $at->year - ($at->month <= 2 ? 1 : 0);
        $era = intdiv($year >= 0 ? $year : $year - 399, 400);
        $yearOfEra = $year - $era * 400;
        $dayOfYear = intdiv(153 * ($at->month + ($at->month > 2 ? -3 : 9)) + 2, 5) + $at->day - 1;
        $dayOfEra = $yearOfEra * 365 + intdiv($yearOfEra, 4) - intdiv($yearOfEra, 100) + $dayOfYear;

        return $era * 146097 + $dayOfEra - 719468;
    }

    /**
     * The period of the same length that ends the day before `from`, and whether it is fair to compare
     * with: not when it starts before the first request the system holds.
     *
     * @return array{from: Carbon, to: Carbon, comparable: bool}
     */
    private static function previousPeriod(CarbonInterface $from, CarbonInterface $to): array
    {
        $length = self::wholeDays($from, $to) + 1;
        $prevTo = Carbon::parse($from)->subDay()->endOfDay();
        $prevFrom = $prevTo->copy()->subDays($length - 1)->startOfDay();
        $first = ServiceRequest::query()->min('created_at');

        return ['from' => $prevFrom, 'to' => $prevTo, 'comparable' => $first !== null && $prevFrom->gte(Carbon::parse($first)->startOfDay())];
    }

    /**
     * A tile's trend for the Delta + Sparkline footer, one shape for every request report.
     * `basis`: 'prev' (previous period), 'since_7d' (7 days ago) or 'no_base' (nothing fair to compare with);
     * a basis with a missing value on either side reads 'none'.
     *
     * @param  list<int|float|null>  $points
     * @return array{direction: 'up'|'down'|'even', label_key: string, values: array<string, int|float>, points: list<int|float|null>, up_is_good: ?bool}
     */
    private static function trend(int|float|null $now, int|float|null $before, string $basis, array $points, ?bool $upIsGood): array
    {
        $delta = $basis === 'no_base' || $now === null || $before === null ? null : round($now - $before, 1);
        $direction = match (true) {
            $delta === null, abs($delta) < 0.05 => 'even',
            $delta > 0 => 'up',
            default => 'down',
        };

        return [
            'direction' => $direction,
            'label_key' => $delta === null && $basis !== 'no_base' ? 'rep_req_trend_none' : "rep_req_trend_{$basis}",
            'values' => $delta === null ? [] : ['delta' => abs($delta)],
            'points' => $points,
            'up_is_good' => $upIsGood,
        ];
    }

    /** @return array<string, string> type value → i18n key */
    private static function typeKeys(): array
    {
        $keys = [];
        foreach (RequestType::cases() as $type) {
            $keys[$type->value] = "req_{$type->value}";
        }

        return $keys;
    }

    /** @return array<string, string> type value → Thai label */
    private static function typeTh(): array
    {
        $labels = [];
        foreach (RequestType::cases() as $type) {
            $labels[$type->value] = $type->labelTh();
        }

        return $labels;
    }
}
