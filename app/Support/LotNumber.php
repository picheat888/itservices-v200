<?php

namespace App\Support;

use App\Models\Stock\StockLot;
use Carbon\CarbonInterface;

/** Running lot numbers LOT-<YYYYMMDD>-<NNNN>, counted across all items per day inside the caller's transaction. */
class LotNumber
{
    public static function next(CarbonInterface $day): string
    {
        $stem = 'LOT-'.$day->format('Ymd').'-';

        // Numeric max of the suffix: string ordering breaks once a sequence passes 9999
        $last = StockLot::where('lot_no', 'like', $stem.'%')
            ->lockForUpdate()
            ->pluck('lot_no')
            ->map(fn (string $no): int => (int) substr($no, strlen($stem)))
            ->max() ?? 0;

        return sprintf('%s%04d', $stem, $last + 1);
    }
}
