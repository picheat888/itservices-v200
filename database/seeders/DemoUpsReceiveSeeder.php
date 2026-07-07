<?php

namespace Database\Seeders;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockBalanceService;
use App\Services\Stock\StockLotService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo data: receive +50 serialized APC Back-UPS BX1100C-MS units across three
 * separate POs into three warehouses. Each PO becomes its own receive movement +
 * FIFO lot + per-warehouse balance, with one in-stock serial per unit. Idempotent:
 * re-running is a no-op once the demo serials exist.
 */
class DemoUpsReceiveSeeder extends Seeder
{
    public function run(): void
    {
        $item = StockItem::where('sku', 'SK-UPS-001')->first();
        if (! $item) {
            $this->command?->warn('SK-UPS-001 not found — skipped.');

            return;
        }

        // Guard: don't double-receive if the demo serials already exist.
        if (StockItemSerial::where('serial', 'BX1100C-0001')->exists()) {
            $this->command?->info('Demo UPS serials already present — skipped.');

            return;
        }

        $balances = app(StockBalanceService::class);
        $lots = app(StockLotService::class);
        $userId = User::where('email', 'it@abcd.co.th')->value('id');

        // [po, warehouse, qty, unit_cost, supplier, moved_at]
        $batches = [
            ['PO-2026-051', 'คลังกลาง IT',     20, 4290, 'JIB Computer Group', '2026-05-25 09:00:00'],
            ['PO-2026-052', 'ห้อง Server Room', 15, 4350, 'Synnex Thailand',    '2026-05-27 10:30:00'],
            ['PO-2026-053', 'คลังโรงงาน 2',    15, 4250, 'Advice IT',           '2026-05-29 14:00:00'],
        ];

        $serialNo = 0;

        DB::transaction(function () use ($item, $batches, $balances, $lots, $userId, &$serialNo) {
            foreach ($batches as [$po, $warehouse, $qty, $cost, $supplier, $movedAt]) {
                $when = Carbon::parse($movedAt);

                $movement = StockMovement::create([
                    'type' => 'receive',
                    'stock_item_id' => $item->id,
                    'qty' => $qty,
                    'unit_cost' => $cost,
                    'from_label' => $supplier,
                    'to_label' => $warehouse,
                    'reference' => $po,
                    'recorded_by' => 'Kanya Phakdee',
                    'user_id' => $userId,
                    'notes' => 'รับเข้า UPS ตาม '.$po,
                    'moved_at' => $when,
                ]);

                // Keep on-hand, per-warehouse balance and FIFO lot in lock-step.
                $item->current_stock += $qty;
                $item->last_move_at = $when->toDateString();
                $item->save();

                $balances->add($item, $warehouse, $qty);
                $lots->addLot($item, $qty, $cost, $movement->id, $when);

                // One in-stock serial per received unit.
                for ($i = 0; $i < $qty; $i++) {
                    $serialNo++;
                    StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => sprintf('BX1100C-%04d', $serialNo),
                        'status' => 'in_stock',
                        'warehouse_id' => Warehouse::resolveId($warehouse),
                        'reference' => $po,
                        'received_at' => $when,
                    ]);
                }
            }
        });

        $this->command?->info("Received {$serialNo} UPS units across ".count($batches).' POs / warehouses.');
    }
}
