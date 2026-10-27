<?php

// A confirmed count sheet as an A4 landscape PDF: letterhead, summary tiles, every line, sign-off boxes.

namespace App\Services\Stock;

use App\Enums\Stock\StockCountReason;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItemSerial;
use App\Models\User;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Collection;

class StockCountPdf
{
    /** @return array{bytes: string, filename: string} */
    public function render(StockCount $count, ?User $printedBy): array
    {
        $count->loadMissing(['countedBy', 'committedBy', 'lines.item']);
        $company = CompanyProfile::get();
        $printedAt = DateDisplay::dateTime(now());
        $printer = $printedBy?->name ?? '';
        $lines = $count->lines->sortBy(fn ($line) => $line->item?->sku)->values();
        $rows = $this->rows($lines);

        $pdf = Pdf::loadView('pdf.stock-count', [
            'company' => $company,
            'count' => $count,
            'rows' => $rows,
            'totals' => $this->totals($rows),
            'printedAt' => $printedAt,
            'printer' => $printer,
            'openedAt' => DateDisplay::dateTime($count->created_at),
            'committedAt' => DateDisplay::dateTime($count->committed_at),
            'committedOn' => DateDisplay::date($count->committed_at),
        ])->setPaper('a4', 'landscape');

        PdfFooter::stamp($pdf, "{$count->reference} ใบนับสต็อก {$count->warehouse}", "พิมพ์โดย {$printer} เมื่อ {$printedAt}", 'หน้า {PAGE_NUM} / {PAGE_COUNT}');

        return [
            'bytes' => $pdf->output(),
            'filename' => DocumentName::make('StockCount', [$count->reference]),
        ];
    }

    /**
     * One display row per line, with the reason in words and lost serials resolved in one query.
     *
     * @param  Collection<int, StockCountLine>  $lines
     * @return list<array<string, mixed>>
     */
    private function rows($lines): array
    {
        $serialIds = $lines->flatMap(fn ($line) => $line->missing_serial_ids ?? [])->unique()->all();
        $serials = $serialIds === [] ? collect() : StockItemSerial::whereIn('id', $serialIds)->pluck('serial', 'id');

        return $lines->map(function ($line, int $index) use ($serials) {
            $variance = $line->variance();
            $reason = null;
            if ($line->reason === StockCountReason::Custom) {
                $reason = $line->reason_note ?: $line->reason->label('th');
            } elseif ($line->reason !== null) {
                $reason = $line->reason->label('th');
            }

            return [
                'no' => $index + 1,
                'sku' => (string) $line->item?->sku,
                'name' => (string) $line->item?->name,
                'track_serial' => (bool) $line->item?->track_serial,
                'system_qty' => $line->system_qty,
                'counted_qty' => $line->counted_qty,
                'variance' => $variance,
                'reason' => $reason,
                'missing_serials' => collect($line->missing_serial_ids ?? [])->map(fn ($id) => $serials[$id] ?? null)->filter()->values()->all(),
            ];
        })->all();
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, int>
     */
    private function totals(array $rows): array
    {
        $counted = array_filter($rows, fn ($row) => $row['counted_qty'] !== null);
        $short = array_filter($counted, fn ($row) => $row['variance'] < 0);
        $over = array_filter($counted, fn ($row) => $row['variance'] > 0);

        return [
            'lines' => count($rows),
            'counted' => count($counted),
            'uncounted' => count($rows) - count($counted),
            'same_lines' => count($counted) - count($short) - count($over),
            'short_lines' => count($short),
            'short_qty' => -array_sum(array_column($short, 'variance')),
            'over_lines' => count($over),
            'over_qty' => array_sum(array_column($over, 'variance')),
            'adjusted_lines' => count($short) + count($over),
        ];
    }
}
