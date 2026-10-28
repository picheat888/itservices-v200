<?php

// Fulfils an approved stock request: one ISS number per request, one movement per source warehouse,
// lots drawn oldest first per warehouse (or the picked serials' own lots), every row linked to the request.

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\DocNumber;
use App\Support\Refusal;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StockIssueService
{
    public function __construct(
        private readonly StockSerialService $serialService,
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
        private readonly StockCountLock $countLock,
    ) {}

    /**
     * Book the issue and mark the request fulfilled; returns the ISS doc_no.
     *
     * @param  array{serial_ids?: list<int>, allocations?: list<array{warehouse: string, qty: int}>, from_warehouse?: ?string}  $data
     */
    public function fulfil(StockRequest $stockRequest, User $user, array $data): string
    {
        return DB::transaction(function () use ($stockRequest, $user, $data): string {
            $this->lockApproved($stockRequest);

            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($stockRequest->stock_item_id);

            if ($item->current_stock < $stockRequest->qty) {
                Refusal::fail('not_enough_stock', ['available' => $item->current_stock], 'qty');
            }

            $serials = $item->track_serial ? $this->pickedSerials($item, $stockRequest, $data) : collect();
            $serialsByWarehouse = $serials->groupBy(fn (StockItemSerial $s) => $s->warehouse?->name ?: 'Unassigned');
            $allocation = $this->allocation($item, $stockRequest, $data, $serialsByWarehouse);

            $this->countLock->assertFree($item->id, $allocation->keys()->all());

            $reference = $stockRequest->reference ?? "REQ-{$stockRequest->id}";
            $docNo = DocNumber::next('issue', (int) now()->year);

            foreach ($allocation as $warehouse => $qty) {
                if ($qty <= 0) {
                    continue;
                }
                $warehouse = (string) $warehouse;

                $movement = StockMovement::create([
                    'doc_no' => $docNo,
                    'type' => 'issue',
                    'stock_item_id' => $item->id,
                    'stock_request_id' => $stockRequest->id,
                    'qty' => $qty,
                    'from_label' => $warehouse,
                    'to_label' => $stockRequest->requester_name,
                    'reference' => $reference,
                    'recorded_by' => $user->name,
                    'user_id' => $user->id,
                    'moved_at' => now(),
                ]);
                $this->balances->remove($item, $warehouse, (int) $qty);

                if ($item->track_serial) {
                    $warehouseSerials = $serialsByWarehouse->get($warehouse, collect());
                    $this->drawSerialLots($item, Warehouse::resolveId($warehouse), $warehouseSerials, $movement, $reference);
                    $this->serialService->issue($item, $warehouseSerials->pluck('id')->all(), $user, $movement, $reference);
                } else {
                    $this->lotService->consume($item, Warehouse::resolveId($warehouse), (int) $qty, $movement, $reference);
                }
            }

            $item->current_stock -= $stockRequest->qty;
            $item->last_move_at = now()->toDateString();
            $item->save();

            $stockRequest->update([
                'status' => 'fulfilled',
                'fulfilled_at' => now(),
                'fulfilled_by' => $user->name,
            ]);

            return $docNo;
        });
    }

    /**
     * The lots a request's issue drew, in the order they were drawn.
     *
     * @return array{doc_no: ?string, lines: list<array{warehouse: ?string, lot_id: int, lot_no: ?string, qty: int}>}
     */
    public function summary(StockRequest $stockRequest): array
    {
        $movementIds = StockMovement::where('stock_request_id', $stockRequest->id)
            ->where('type', 'issue')
            ->orderBy('id')
            ->pluck('doc_no', 'id');

        $lines = StockLotEntry::with(['lot:id,lot_no', 'warehouse:id,name'])
            ->whereIn('stock_movement_id', $movementIds->keys())
            ->where('qty', '<', 0)
            ->orderBy('stock_movement_id')
            ->orderBy('id')
            ->get()
            ->map(fn (StockLotEntry $entry): array => [
                'warehouse' => $entry->warehouse?->name,
                'lot_id' => $entry->stock_lot_id,
                'lot_no' => $entry->lot?->lot_no,
                'qty' => -$entry->qty,
            ])
            ->values()
            ->all();

        return ['doc_no' => $movementIds->first(), 'lines' => $lines];
    }

    /** Re-read the request under lock so two fulfils of one request book once. */
    private function lockApproved(StockRequest $stockRequest): void
    {
        $stockRequest->setRawAttributes(StockRequest::lockForUpdate()->findOrFail($stockRequest->id)->getAttributes(), true);

        if ($stockRequest->status !== 'approved') {
            Refusal::fail('request_wrong_status', ['expected' => 'approved', 'current' => $stockRequest->status], 'status');
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @return Collection<int, StockItemSerial>
     */
    private function pickedSerials(StockItem $item, StockRequest $stockRequest, array $data): Collection
    {
        $serials = StockItemSerial::with('warehouse')
            ->where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $data['serial_ids'] ?? [])
            ->get();

        if ($serials->count() !== $stockRequest->qty) {
            Refusal::fail('issue_serials_mismatch', ['qty' => $stockRequest->qty], 'serial_ids');
        }

        return $serials;
    }

    /**
     * Warehouse name => qty: from the picked serials, the allocations list, or the single from_warehouse.
     *
     * @param  array<string, mixed>  $data
     * @param  Collection<string, Collection<int, StockItemSerial>>  $serialsByWarehouse
     * @return Collection<string, int>
     */
    private function allocation(StockItem $item, StockRequest $stockRequest, array $data, Collection $serialsByWarehouse): Collection
    {
        if ($item->track_serial) {
            $allocation = $serialsByWarehouse->map->count();
        } elseif (! empty($data['allocations'])) {
            $allocation = collect($data['allocations'])
                ->groupBy('warehouse')
                ->map(fn ($rows) => (int) collect($rows)->sum('qty'));
        } else {
            $allocation = collect([(($data['from_warehouse'] ?? null) ?: 'Unassigned') => $stockRequest->qty]);
        }

        if ((int) $allocation->sum() !== $stockRequest->qty) {
            Refusal::fail('allocation_mismatch', ['qty' => $stockRequest->qty], 'allocations');
        }

        return $allocation;
    }

    /**
     * Draw each picked serial's own lot; serials received before lots existed draw FIFO in their warehouse.
     *
     * @param  Collection<int, StockItemSerial>  $serials  verified in_stock serials of this item in this warehouse
     */
    private function drawSerialLots(StockItem $item, ?int $warehouseId, Collection $serials, StockMovement $movement, string $reference): void
    {
        $qtyByLot = $serials->whereNotNull('stock_lot_id')
            ->countBy('stock_lot_id')
            ->mapWithKeys(fn (int $qty, $lotId): array => [(int) $lotId => $qty])
            ->all();
        $this->lotService->consumeLots($qtyByLot, $movement, $reference);

        $withoutLot = $serials->whereNull('stock_lot_id')->count();
        $this->lotService->consume($item, $warehouseId, $withoutLot, $movement, $reference);
    }
}
