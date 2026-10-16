<?php

namespace App\Support;

use App\Models\Stock\StockMovement;

/** Running stock document numbers <PREFIX>-<YEAR>-<NNN>, counted per prefix and year inside the movement transaction. */
class DocNumber
{
    private const PREFIX = [
        'receive' => 'RCV',
        'issue' => 'ISS',
        'return' => 'RET',
        'transfer' => 'TRF',
        'adjust_up' => 'ADJ',
        'adjust_down' => 'ADJ',
    ];

    public static function next(string $type, int $year): string
    {
        $prefix = self::PREFIX[$type] ?? 'MOV';
        $stem = "{$prefix}-{$year}-";

        // Numeric max of the suffix: string ordering breaks once a sequence passes 999
        $last = StockMovement::where('doc_no', 'like', $stem.'%')
            ->lockForUpdate()
            ->pluck('doc_no')
            ->map(fn (string $no): int => (int) substr($no, strlen($stem)))
            ->max() ?? 0;

        return sprintf('%s%03d', $stem, $last + 1);
    }
}
