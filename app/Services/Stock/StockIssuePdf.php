<?php

// The issue sheet (ISS) of a fulfilled request as an A4 portrait Thai PDF: letterhead, facts,
// the item, the lots to pick with tick boxes, notes and sign-off boxes.

namespace App\Services\Stock;

use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
use App\Support\Refusal;
use Barryvdh\DomPDF\Facade\Pdf;

class StockIssuePdf
{
    public function __construct(private readonly StockLotReader $reader) {}

    /** The PDF bytes; a request that has not been issued is refused (`request_not_issued`). */
    public function render(StockRequest $request, User $printedBy): string
    {
        $issue = $this->reader->trail($request)['issue'];
        if ($request->status !== 'fulfilled' || $issue === null) {
            Refusal::fail('request_not_issued', ['current' => $request->status], 'status');
        }

        $request->loadMissing('item.unit');
        $emptied = $this->emptiedLots($request);
        $lots = array_map(fn (array $line): array => [
            'warehouse' => $line['warehouse'],
            'lot_no' => $line['lot_no'],
            'received' => DateDisplay::date($line['received_at']),
            'qty' => $line['qty'],
            'emptied' => in_array($line['lot_id'], $emptied, true),
        ], $issue['lines']);
        $total = array_sum(array_column($lots, 'qty'));
        $printedAt = DateDisplay::dateTime(now());

        $pdf = Pdf::loadView('pdf.stock-issue', [
            'company' => CompanyProfile::get(),
            'docNo' => $issue['doc_no'],
            'reference' => $request->reference,
            'printedAt' => $printedAt,
            'printer' => $printedBy->name,
            'receiver' => $request->requester_name,
            'requestedAt' => DateDisplay::dateTime($request->created_at),
            'reason' => $request->reason,
            'issuedAt' => DateDisplay::dateTime($request->fulfilled_at ?? $issue['moved_at']),
            'issuedBy' => $request->fulfilled_by ?: $issue['recorded_by'],
            'approver' => $request->approver_name,
            'approvedAt' => $request->approved_at !== null ? DateDisplay::dateTime($request->approved_at) : null,
            'item' => [
                'sku' => $request->item?->sku,
                'name' => $request->item?->name,
                'unit' => $request->item?->unit?->name,
                'qty' => $total,
            ],
            'lots' => $lots,
            'total' => $total,
        ])->setPaper('a4', 'portrait');

        PdfFooter::stamp($pdf, "{$issue['doc_no']} ใบจ่ายของ อ้างอิง {$request->reference}", '', 'หน้า {PAGE_NUM} / {PAGE_COUNT}');

        return $pdf->output();
    }

    public function filename(StockRequest $request): string
    {
        return DocumentName::make('StockIssue', [$request->issueMovements()->value('doc_no')]);
    }

    /**
     * Lots this issue took to zero (the sheet marks them "หยิบหมด Lot").
     *
     * @return list<int>
     */
    private function emptiedLots(StockRequest $request): array
    {
        $entries = StockLotEntry::whereIn('stock_movement_id', $request->issueMovements()->pluck('id'))
            ->where('qty', '<', 0)
            ->orderBy('id')
            ->get(['id', 'stock_lot_id', 'qty']);
        $held = $this->reader->heldAt($entries);

        return $entries->groupBy('stock_lot_id')
            ->filter(fn ($group): bool => ($held[$group->last()->id] ?? null) === 0)
            ->keys()
            ->map(fn ($lotId): int => (int) $lotId)
            ->values()
            ->all();
    }
}
