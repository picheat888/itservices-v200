<?php

namespace App\Support;

use App\Models\StockMovement;

/**
 * Running document numbers for stock movements: <PREFIX>-<YEAR>-<NNN>, counted per
 * (prefix, year). Call inside the movement transaction so the row lock serialises
 * concurrent inserts and prevents duplicates.
 */
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

    /**
     * Generate the next sequential document number for the given movement type and year.
     * Format: <PREFIX>-<YEAR>-<NNN> (e.g. TRF-2026-001).
     * Reads the max existing doc_no for the prefix+year to determine the next sequence.
     */
    public static function next(string $type, int $year): string
    {
        $prefix = self::PREFIX[$type] ?? 'MOV';
        $like = "{$prefix}-{$year}-%";

        $last = StockMovement::where('doc_no', 'like', $like)
            ->orderByDesc('doc_no')
            ->lockForUpdate()
            ->value('doc_no');

        $seq = $last ? ((int) substr($last, -3)) + 1 : 1;

        return sprintf('%s-%d-%03d', $prefix, $year, $seq);
    }
}
