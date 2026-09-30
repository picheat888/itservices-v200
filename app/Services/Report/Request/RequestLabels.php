<?php

namespace App\Services\Report\Request;

use App\Enums\Request\RequestType;
use Illuminate\Support\Carbon;

/**
 * Request type / status wording shared by the request tabular reports: the i18n key the page
 * shows (the Requests module's own `req_*` keys) and the Thai label the Excel/PDF prints
 * (RequestType::labelTh(), and resources/js/lang/th/requests.ts for statuses).
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

    /**
     * A from/to date-filter pair as whole days; a reversed range is read the right way round.
     *
     * @param  array<string, mixed>  $filters
     * @return array{0: Carbon, 1: Carbon}
     */
    private function dateRange(array $filters): array
    {
        $from = Carbon::parse($filters['from'])->startOfDay();
        $to = Carbon::parse($filters['to'])->endOfDay();

        return $from->lte($to) ? [$from, $to] : [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
    }
}
