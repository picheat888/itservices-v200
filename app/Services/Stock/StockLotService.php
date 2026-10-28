<?php

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Support\LotNumber;
use App\Support\Refusal;
use Illuminate\Database\Eloquent\Builder;

/**
 * FIFO lots per warehouse. Receipts open numbered lots, draws take the oldest lots in one warehouse,
 * and every change writes a signed entry to the lot ledger. Callers own the transaction.
 */
class StockLotService
{
    /** Open a numbered lot in a warehouse and write its +qty entry. */
    public function open(StockItem $item, ?int $warehouseId, int $qty, float $unitCost, ?StockMovement $movement, ?string $reference = null): StockLot
    {
        $receivedAt = $movement?->moved_at ?? now();

        $lot = StockLot::create([
            'stock_item_id' => $item->id,
            'stock_movement_id' => $movement?->id,
            'lot_no' => LotNumber::next($receivedAt),
            'warehouse_id' => $warehouseId,
            'unit_cost' => $unitCost,
            'qty_received' => $qty,
            'qty_remaining' => $qty,
            'received_at' => $receivedAt,
        ]);

        $this->writeEntry($lot, $qty, $movement, $reference);

        return $lot;
    }

    /**
     * Draw qty from the oldest lots of one warehouse, one -take entry per lot touched.
     *
     * @return array<int, int> lot id => qty taken
     */
    public function consume(StockItem $item, ?int $warehouseId, int $qty, ?StockMovement $movement, ?string $reference = null): array
    {
        if ($qty <= 0) {
            return [];
        }

        $lots = $this->openLotsIn($item, $warehouseId)->lockForUpdate()->get();

        $available = (int) $lots->sum('qty_remaining');
        if ($available < $qty) {
            $warehouseName = $warehouseId === null ? 'Unassigned' : (Warehouse::whereKey($warehouseId)->value('name') ?? 'Unassigned');
            Refusal::fail('not_enough_stock_in_warehouse', ['warehouse' => $warehouseName, 'available' => $available], 'qty');
        }

        $taken = [];
        $left = $qty;
        foreach ($lots as $lot) {
            if ($left <= 0) {
                break;
            }
            $take = min($lot->qty_remaining, $left);
            $lot->qty_remaining -= $take;
            $lot->save();
            $this->writeEntry($lot, -$take, $movement, $reference);
            $taken[$lot->id] = $take;
            $left -= $take;
        }

        return $taken;
    }

    /**
     * Draw exact quantities from named lots (serial picks); refuses before writing when any lot is short.
     *
     * @param  array<int, int>  $qtyByLot  lot id => qty
     */
    public function consumeLots(array $qtyByLot, ?StockMovement $movement, ?string $reference = null): void
    {
        $qtyByLot = array_filter($qtyByLot, fn (int $qty): bool => $qty > 0);
        if ($qtyByLot === []) {
            return;
        }

        $lots = StockLot::whereKey(array_keys($qtyByLot))->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        foreach ($qtyByLot as $lotId => $qty) {
            $lot = $lots->get($lotId);
            if ($lot === null || $lot->qty_remaining < $qty) {
                Refusal::fail('lot_short', ['lot_no' => $lot?->lot_no]);
            }
        }

        foreach ($qtyByLot as $lotId => $qty) {
            $lot = $lots->get($lotId);
            $lot->qty_remaining -= $qty;
            $lot->save();
            $this->writeEntry($lot, -$qty, $movement, $reference);
        }
    }

    /** Add qty back to an existing lot in whatever warehouse it sits in now. */
    public function restore(StockLot $lot, int $qty, ?StockMovement $movement, ?string $reference = null): void
    {
        if ($qty <= 0) {
            return;
        }

        $lot = StockLot::whereKey($lot->id)->lockForUpdate()->firstOrFail();
        $lot->qty_remaining += $qty;
        $lot->save();

        $this->writeEntry($lot, $qty, $movement, $reference);
    }

    /** Move a whole lot to another warehouse with a qty-0 entry; returns the quantity it carried. */
    public function moveLot(StockLot $lot, ?int $toWarehouseId, StockMovement $movement): int
    {
        $lot = StockLot::whereKey($lot->id)->lockForUpdate()->firstOrFail();
        $fromWarehouseId = $lot->warehouse_id;

        $lot->warehouse_id = $toWarehouseId;
        $lot->save();

        $this->writeEntry($lot, 0, $movement, null, $fromWarehouseId);

        return $lot->qty_remaining;
    }

    /**
     * Read-only FIFO preview of a draw from one warehouse.
     *
     * @return list<array{lot_id: int, lot_no: ?string, received_at: string, remaining: int, take: int}>
     */
    public function plan(StockItem $item, ?int $warehouseId, int $qty): array
    {
        $plan = [];
        $left = $qty;

        foreach ($this->openLotsIn($item, $warehouseId)->get() as $lot) {
            if ($left <= 0) {
                break;
            }
            $take = min($lot->qty_remaining, $left);
            $plan[] = [
                'lot_id' => $lot->id,
                'lot_no' => $lot->lot_no,
                'received_at' => $lot->received_at->toDateTimeString(),
                'remaining' => $lot->qty_remaining,
                'take' => $take,
            ];
            $left -= $take;
        }

        return $plan;
    }

    /**
     * What a request can still return per lot: what its issues drew minus what its returns put back.
     *
     * @return array<int, int> lot id => qty left, only lots with something left
     */
    public function issuedLeft(StockRequest $request): array
    {
        return collect($this->drawnAndReturned([$request->id])[$request->id] ?? [])
            ->map(fn (array $lot): int => $lot['issued'] - $lot['returned'])
            ->filter(fn (int $left): bool => $left > 0)
            ->all();
    }

    /**
     * Per request and lot: what its issues drew and what its returns put back.
     *
     * @param  list<int>|Builder<StockRequest>  $requests  request ids, or a query selecting them
     * @return array<int, array<int, array{issued: int, returned: int}>> request id => lot id (ascending) => figures
     */
    public function drawnAndReturned(array|Builder $requests): array
    {
        $rows = StockLotEntry::query()
            ->join('stock_movements', 'stock_movements.id', '=', 'stock_lot_entries.stock_movement_id')
            ->whereIn('stock_movements.stock_request_id', $requests instanceof Builder ? $requests->select('id') : $requests)
            ->whereIn('stock_movements.type', ['issue', 'return'])
            ->groupBy('stock_movements.stock_request_id', 'stock_lot_entries.stock_lot_id', 'stock_movements.type')
            ->orderBy('stock_lot_entries.stock_lot_id')
            ->selectRaw('stock_movements.stock_request_id as request_id, stock_lot_entries.stock_lot_id as lot_id, stock_movements.type as type, SUM(stock_lot_entries.qty) as total')
            ->toBase()
            ->get();

        $figures = [];
        foreach ($rows as $row) {
            $requestId = (int) $row->request_id;
            $lotId = (int) $row->lot_id;
            $figures[$requestId][$lotId] ??= ['issued' => 0, 'returned' => 0];
            if ($row->type === 'issue') {
                $figures[$requestId][$lotId]['issued'] -= (int) $row->total;
            } else {
                $figures[$requestId][$lotId]['returned'] += (int) $row->total;
            }
        }

        return $figures;
    }

    /** @return Builder<StockLot> */
    private function openLotsIn(StockItem $item, ?int $warehouseId): Builder
    {
        return StockLot::where('stock_item_id', $item->id)
            ->when(
                $warehouseId === null,
                fn (Builder $q) => $q->whereNull('warehouse_id'),
                fn (Builder $q) => $q->where('warehouse_id', $warehouseId),
            )
            ->where('qty_remaining', '>', 0)
            ->orderBy('received_at')
            ->orderBy('id');
    }

    private function writeEntry(StockLot $lot, int $qty, ?StockMovement $movement, ?string $reference, ?int $fromWarehouseId = null): void
    {
        StockLotEntry::create([
            'stock_lot_id' => $lot->id,
            'stock_movement_id' => $movement?->id,
            'warehouse_id' => $lot->warehouse_id,
            'from_warehouse_id' => $fromWarehouseId,
            'qty' => $qty,
            'reference' => $reference,
            'occurred_at' => $movement?->moved_at ?? now(),
        ]);
    }
}
