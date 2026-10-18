<?php

// One SKU's audit history (movements, FIFO lots, serial timelines, reconciliation) and its A4 PDF per view.

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\User;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
use Barryvdh\DomPDF\Facade\Pdf;

class StockHistoryService
{
    public const VIEWS = ['summary', 'issue', 'receive', 'return', 'adjust', 'transfer'];

    /** Movement types that add to / take from the on-hand quantity; a transfer moves stock between warehouses only. */
    private const ADDS = ['receive', 'return', 'adjust_up'];

    private const TAKES = ['issue', 'adjust_down'];

    /**
     * Shared by the JSON endpoint and the PDF export.
     *
     * @return array<string, mixed>
     */
    public function build(StockItem $stockItem): array
    {
        $stockItem->load([
            'unit',
            'balances.warehouse',
            'movements.user.employee:id,first_name_th,last_name_th',
            'lots' => fn ($q) => $q->latest('received_at'),
            'lots.movement',
            'serials.warehouse',
            'serials.events.movement',
            'serials.events.user.employee:id,first_name_th,last_name_th',
        ]);

        $lotSerials = $stockItem->serials->groupBy('stock_movement_id');

        return [
            'item' => [
                'id' => $stockItem->id,
                'sku' => $stockItem->sku,
                'name' => $stockItem->name,
                'unit' => $stockItem->unit?->name,
                'current_stock' => $stockItem->current_stock,
                'stock_value' => round($stockItem->stockValue(), 2),
                'track_serial' => (bool) $stockItem->track_serial,
            ],
            'reconciliation' => $this->reconciliation($stockItem),
            'balances' => $stockItem->balances
                ->filter(fn ($b) => $b->qty !== 0)
                ->sortByDesc('qty')
                ->map(fn ($b) => ['warehouse' => $b->warehouse?->name, 'qty' => $b->qty])
                ->values(),
            'movements' => $stockItem->movements->map(fn ($m) => [
                'id' => $m->id,
                'doc_no' => $m->doc_no,
                'type' => $m->type,
                'qty' => $m->qty,
                'unit_cost' => $m->unit_cost,
                'from_label' => $m->from_label,
                'to_label' => $m->to_label,
                'reference' => $m->reference,
                'recorded_by' => $m->recorded_by,
                'recorded_by_th' => $m->user?->name_th,
                'notes' => $m->notes,
                'moved_at' => $m->moved_at?->toIso8601String(),
            ])->values(),
            'lots' => $stockItem->lots->map(fn ($l) => [
                'unit_cost' => $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'received_at' => $l->received_at?->toIso8601String(),
                'doc_no' => $l->movement?->doc_no,
                'serials' => ($lotSerials[$l->stock_movement_id] ?? collect())->pluck('serial')->values(),
            ])->values(),
            'serials' => $stockItem->serials->map(fn ($s) => [
                'serial' => $s->serial,
                'status' => $s->status,
                'warehouse' => $s->warehouse?->name,
                'events' => $s->events->map(fn ($e) => [
                    'event' => $e->event,
                    'occurred_at' => $e->occurred_at?->toIso8601String(),
                    'doc_no' => $e->movement?->doc_no,
                    'reference' => $e->reference,
                    'recorded_by' => $e->recorded_by,
                    'recorded_by_th' => $e->user?->name_th,
                    'from_label' => $e->from_label,
                    'to_label' => $e->to_label,
                ])->values(),
            ])->values(),
        ];
    }

    /**
     * Every movement type's count and quantity, and whether they add up to the on-hand stock.
     *
     * @return array{lines: list<array{type: string, count: int, qty: int, sign: int}>, computed: int, current: int, difference: int}
     */
    private function reconciliation(StockItem $stockItem): array
    {
        $byType = $stockItem->movements->groupBy('type');
        $lines = [];
        $computed = 0;
        foreach (['receive', 'return', 'adjust_up', 'issue', 'adjust_down', 'transfer'] as $type) {
            $rows = $byType->get($type, collect());
            $qty = (int) $rows->sum('qty');
            $sign = in_array($type, self::ADDS, true) ? 1 : (in_array($type, self::TAKES, true) ? -1 : 0);
            $computed += $sign * $qty;
            $lines[] = ['type' => $type, 'count' => $rows->count(), 'qty' => $qty, 'sign' => $sign];
        }

        return [
            'lines' => $lines,
            'computed' => $computed,
            'current' => (int) $stockItem->current_stock,
            'difference' => (int) $stockItem->current_stock - $computed,
        ];
    }

    /**
     * The PDF of one view, with the shared letterhead and a footer on every page.
     *
     * @return array{bytes: string, filename: string}
     */
    public function pdf(StockItem $stockItem, string $view, ?User $printedBy): array
    {
        $view = in_array($view, self::VIEWS, true) ? $view : 'summary';
        // Pure nested arrays for the Blade (no Collection surprises in array_filter, etc.).
        $history = json_decode(json_encode($this->build($stockItem)), true);
        $company = CompanyProfile::get();
        // An English document, so English month names.
        $printedAt = DateDisplay::dateTime(now(), null, 'en');
        $printer = $printedBy?->name ?? '';

        $pdf = Pdf::loadView('pdf.stock-history', [
            'history' => $history,
            'view' => $view,
            'company' => $company,
            'printedAt' => $printedAt,
            'dateConfig' => DateDisplay::config(),
        ])->setPaper('a4', $view === 'summary' ? 'portrait' : 'landscape');

        PdfFooter::stamp($pdf, $company['app_name'], "Printed by {$printer} on {$printedAt}");

        return [
            'bytes' => $pdf->output(),
            // Standard system-wide filename: StockHistory_<View>_<SKU>_<YYYY-MM-DD>.pdf.
            'filename' => DocumentName::make('StockHistory', [ucfirst($view), $stockItem->sku]),
        ];
    }
}
