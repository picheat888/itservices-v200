<?php

// Books a receive: one RCV movement that opens a new lot in the destination warehouse,
// with its balance and, for serialized items, one serial row and history event per unit.

namespace App\Services\Stock;

use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Support\DocNumber;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class StockReceiveService
{
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
        private readonly StockCountLock $countLock,
    ) {}

    /**
     * Record the receive in one transaction; the opened lot rides on the movement as `openedLot`.
     *
     * @param  array{stock_item_id: int, qty?: ?int, unit_cost?: float|int|string|null, from_label?: ?string, to_label?: ?string, reference?: ?string, notes?: ?string, moved_at?: ?string}  $data
     * @param  array<int, string>  $serials  cleaned serials of a serialized receive ([] otherwise)
     */
    public function record(array $data, ?string $recordedBy, ?int $userId = null, array $serials = []): StockMovement
    {
        return DB::transaction(function () use ($data, $recordedBy, $userId, $serials): StockMovement {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);

            $qty = $serials !== [] ? count($serials) : (int) ($data['qty'] ?? 0);
            // Destination defaults to 'Unassigned' (never '') so balances and serials agree.
            $warehouse = ($data['to_label'] ?? null) ?: 'Unassigned';
            $reference = $data['reference'] ?? null;

            $this->countLock->assertFree($item->id, [$data['to_label'] ?? null]);

            $unitCost = isset($data['unit_cost']) ? (float) $data['unit_cost'] : null;
            $movedAt = isset($data['moved_at']) ? Carbon::parse($data['moved_at']) : now();

            $movement = StockMovement::create([
                'doc_no' => DocNumber::next('receive', (int) $movedAt->year),
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                'from_label' => $data['from_label'] ?? null,
                'to_label' => $data['to_label'] ?? null,
                'reference' => $reference,
                'recorded_by' => $recordedBy,
                'user_id' => $userId,
                'notes' => $data['notes'] ?? null,
                'moved_at' => $movedAt,
            ]);

            // Lot cost falls back to the pre-receive average, so resolve it before current_stock changes.
            $lotCost = $unitCost ?? $item->avgCost();

            $item->current_stock += $qty;
            $this->touchLastMove($item, $movement);
            $item->save();

            $this->balances->add($item, $warehouse, $qty);
            $warehouseId = Warehouse::resolveId($warehouse);
            $openedLot = $this->lotService->open($item, $warehouseId, $qty, $lotCost, $movement, $reference);
            $movement->setRelation('openedLot', $openedLot->load('warehouse'));

            foreach ($serials as $serial) {
                $row = StockItemSerial::create([
                    'stock_item_id' => $item->id,
                    'stock_movement_id' => $movement->id,
                    'serial' => $serial,
                    'status' => 'in_stock',
                    'warehouse_id' => $warehouseId,
                    'reference' => $reference,
                    'received_at' => $movement->moved_at,
                    'stock_lot_id' => $openedLot->id,
                ]);
                StockItemSerialEvent::log($row, 'received', [
                    'stock_movement_id' => $movement->id,
                    'reference' => $reference,
                    'warehouse' => $warehouse,
                    'user_id' => $userId,
                    'recorded_by' => $recordedBy,
                    'occurred_at' => $movement->moved_at,
                ]);
            }

            AuditLog::record('Stock receive', "{$item->sku} ×{$qty}", subject: $item);

            return $movement;
        });
    }

    /** The item's last movement day only moves forward: a backdated entry does not make it look idle. */
    private function touchLastMove(StockItem $item, StockMovement $movement): void
    {
        if ($item->last_move_at === null || $movement->moved_at->greaterThan($item->last_move_at->endOfDay())) {
            $item->last_move_at = $movement->moved_at->toDateString();
        }
    }
}
