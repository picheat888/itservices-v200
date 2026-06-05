<?php

namespace App\Support;

/**
 * Standard, system-wide document filename builder.
 *
 * Format: <Doc>_<part>_..._<YYYY-MM-DD>.<ext> — no spaces (collapsed to '-'),
 * underscore-separated segments, dated with today's date so files sort by name.
 * Example: DocumentName::make('StockHistory', ['Receive', 'SK-UPS-001']) =>
 *          "StockHistory_Receive_SK-UPS-001_2026-06-03.pdf".
 */
class DocumentName
{
    /**
     * @param  array<int, string|int|null>  $parts  Identifying segments (e.g. category, code).
     */
    public static function make(string $doc, array $parts = [], string $ext = 'pdf'): string
    {
        $segments = array_merge([$doc], $parts, [now()->format('Y-m-d')]);

        $clean = array_filter(array_map(
            fn ($s) => preg_replace('/\s+/', '-', trim((string) $s)),
            $segments
        ), fn ($s) => $s !== '');

        return implode('_', $clean).'.'.$ext;
    }
}
