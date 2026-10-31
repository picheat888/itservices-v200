<?php

// Records a receive, return or transfer (with its audit row and the stock-level alert), and reads a movement's serials and sticker sheet.

namespace App\Services\Stock;

use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\SearchTerms;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Picqer\Barcode\Renderers\HtmlRenderer;
use Picqer\Barcode\Types\TypeCode128;

class StockMovementService
{
    public function __construct(
        private readonly StockReceiveService $receives,
        private readonly StockReturnService $returns,
        private readonly StockTransferService $transfers,
        private readonly StockNotificationService $notices,
    ) {}

    /**
     * The movement log, newest first, by type and item, searched across document, reference, recorder and item.
     *
     * @param  array{type: ?string, stock_item_id: mixed, search: mixed}  $filters
     */
    public function page(array $filters, int $perPage): LengthAwarePaginator
    {
        $query = StockMovement::with(['item', 'user.employee'])->orderByDesc('moved_at')->orderByDesc('id');

        if ($filters['type'] !== null) {
            $query->where('type', $filters['type']);
        }
        if ($filters['stock_item_id'] !== null) {
            $query->where('stock_item_id', $filters['stock_item_id']);
        }

        SearchTerms::apply($query, $filters['search'], [
            'doc_no', 'reference', 'recorded_by',
            SearchTerms::related('item', ['sku', 'name']),
            SearchTerms::related('user', [SearchTerms::related('employee', ['code', ...SearchTerms::personName()])]),
        ]);

        return $query->paginate($perPage);
    }

    /** @param  array<string, mixed>  $data  validated by StoreStockMovementRequest */
    public function record(array $data, ?User $user): StockMovement
    {
        $item = StockItem::findOrFail($data['stock_item_id']);

        if ($data['type'] === 'return') {
            $this->returns->assertSerialsPicked($item, $data);
            $movement = $this->returns->record($item, StockRequest::findOrFail($data['stock_request_id']), $data, $user);
            $returned = (int) StockMovement::where('type', 'return')->where('doc_no', $movement->doc_no)->sum('qty');
            AuditLog::record('Stock return', "{$item->sku} ×{$returned}", subject: $item);
        } elseif ($data['type'] === 'transfer') {
            $movement = $this->transfers->record($item, $data['from_label'], $data['to_label'], $data['lot_ids'], $data, $user);
            AuditLog::record('Stock transfer', "{$item->sku} ×{$movement->qty}", subject: $item);
        } else {
            $serials = $this->receives->serialsToReceive($item, $data);
            $movement = $this->receives->record($data, $user?->name, $user?->id, $serials);
        }

        // On-hand changed: the real-time stock-level alert
        $this->notices->alert($item->fresh());

        return $movement;
    }

    /**
     * The serial codes attached to a movement, ordered (the detail dialog's list).
     *
     * @return Collection<int, string>
     */
    public function serialCodes(StockMovement $movement): Collection
    {
        return $this->serialsOf($movement)->pluck('serial')->values();
    }

    /**
     * An A4 sheet of 50 × 25 mm Code 128 stickers, one per serial of the movement.
     *
     * @return array{bytes: string, filename: string}
     */
    public function labelsPdf(StockMovement $movement): array
    {
        $movement->loadMissing('item.category');
        $serials = $this->serialsOf($movement)->with('lot:id,lot_no')->get();

        // Fixed width (~47 mm ≈ 177 px) to fill the sticker
        $type = new TypeCode128;
        $renderer = new HtmlRenderer;
        $labels = $serials->map(fn (StockItemSerial $serial) => [
            'serial' => $serial->serial,
            'lot_no' => $serial->lot?->lot_no,
            'barcode' => $renderer->render($type->getBarcode($serial->serial), 177, 30),
        ])->all();

        $pdf = Pdf::loadView('pdf.serial-labels', [
            'item' => $movement->item,
            'labels' => $labels,
            'date' => DateDisplay::date($movement->moved_at, null, 'en'),
        ])->setPaper('a4', 'portrait');

        return ['bytes' => $pdf->output(), 'filename' => DocumentName::make('SerialLabels', [$movement->item?->sku])];
    }

    /**
     * The serials attached to a movement by its own id, or by reference for rows from before the id was stored.
     *
     * @return Builder<StockItemSerial>
     */
    private function serialsOf(StockMovement $movement): Builder
    {
        $serialIds = StockItemSerialEvent::query()
            ->where('stock_item_id', $movement->stock_item_id)
            ->where(function ($q) use ($movement) {
                $q->where('stock_movement_id', $movement->id);
                if ($movement->reference) {
                    $q->orWhere(function ($legacy) use ($movement) {
                        $legacy->whereNull('stock_movement_id')->where('reference', $movement->reference);
                    });
                }
            })
            ->pluck('stock_item_serial_id')
            ->unique();

        return StockItemSerial::whereIn('id', $serialIds)->orderBy('serial');
    }
}
