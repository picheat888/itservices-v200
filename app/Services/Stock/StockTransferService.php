<?php

// Books a transfer between two warehouses by moving whole lots: one TRF movement, lot numbers unchanged.

namespace App\Services\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\DocNumber;
use App\Support\Refusal;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class StockTransferService
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
        private readonly StockCountLock $countLock,
    ) {}

    /**
     * Move the named lots from one warehouse to another; qty is whatever the lots hold.
     *
     * @param  list<int>  $lotIds
     * @param  array{reference?: ?string, notes?: ?string, moved_at?: ?string}  $data
     */
    public function record(StockItem $item, string $from, string $to, array $lotIds, array $data, User $user): StockMovement
    {
        if ($from === $to) {
            Refusal::fail('same_warehouse', field: 'to_label');
        }

        return DB::transaction(function () use ($item, $from, $to, $lotIds, $data, $user): StockMovement {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($item->id);
            $lots = $this->lockMovableLots($item, Warehouse::resolveId($from), $lotIds);

            $this->countLock->assertFree($item->id, [$from, $to]);

            $movedAt = isset($data['moved_at']) ? Carbon::parse($data['moved_at']) : now();
            $toWarehouseId = Warehouse::resolveId($to);

            $movement = StockMovement::create([
                'doc_no' => DocNumber::next('transfer', (int) $movedAt->year),
                'type' => 'transfer',
                'stock_item_id' => $item->id,
                'qty' => (int) $lots->sum('qty_remaining'),
                'from_label' => $from,
                'to_label' => $to,
                'reference' => $data['reference'] ?? null,
                'recorded_by' => $user->name,
                'user_id' => $user->id,
                'notes' => $data['notes'] ?? null,
                'moved_at' => $movedAt,
            ]);

            $qty = 0;
            foreach ($lots as $lot) {
                $qty += $this->lotService->moveLot($lot, $toWarehouseId, $movement);
            }

            // Stock- and cost-neutral: only the per-warehouse balance and the serial locations move
            $this->balances->move($item, $from, $to, $qty);
            $this->moveSerials($item, $lots->modelKeys(), $toWarehouseId, $movement, $from, $to, $user);

            if ($item->last_move_at === null || $movedAt->greaterThan($item->last_move_at->endOfDay())) {
                $item->last_move_at = $movedAt->toDateString();
            }
            $item->save();

            return $movement;
        });
    }

    /**
     * The named lots under lock, each this item's, in the source warehouse and not empty.
     *
     * @param  list<int>  $lotIds
     * @return Collection<int, StockLot>
     */
    private function lockMovableLots(StockItem $item, ?int $sourceWarehouseId, array $lotIds)
    {
        $ids = array_values(array_unique(array_map('intval', $lotIds)));
        $lots = StockLot::whereKey($ids)->orderBy('id')->lockForUpdate()->get();

        $movable = $lots->filter(fn (StockLot $lot): bool => $lot->stock_item_id === $item->id
            && $lot->warehouse_id === $sourceWarehouseId
            && $lot->qty_remaining > 0);

        if ($ids === [] || $movable->count() !== count($ids)) {
            Refusal::fail('transfer_lot_invalid', field: 'lot_ids');
        }

        return $movable->values();
    }

    /** @param  list<int>  $lotIds */
    private function moveSerials(StockItem $item, array $lotIds, ?int $toWarehouseId, StockMovement $movement, string $from, string $to, User $user): void
    {
        if (! $item->track_serial) {
            return;
        }

        $serials = StockItemSerial::lockForUpdate()
            ->where('stock_item_id', $item->id)
            ->whereIn('stock_lot_id', $lotIds)
            ->where('status', 'in_stock')
            ->get();

        if ($serials->isEmpty()) {
            return;
        }

        StockItemSerial::whereIn('id', $serials->modelKeys())->update(['warehouse_id' => $toWarehouseId]);

        foreach ($serials as $serial) {
            StockItemSerialEvent::log($serial, 'transferred', [
                'stock_movement_id' => $movement->id,
                'from_label' => $from,
                'to_label' => $to,
                'user_id' => $user->id,
                'recorded_by' => $user->name,
                'occurred_at' => $movement->moved_at,
            ]);
        }
    }
}
