<?php

namespace Database\Seeders;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\StockBalanceService;
use App\Services\StockLotService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo data: 20 additional receive movements for the APC Back-UPS BX1100C-MS so
 * the detail dialog's FIFO-lot table has enough lots (>10) to exercise paging.
 * Each receive is its own PO → movement + lot + per-warehouse balance + serials.
 * Idempotent: re-running is a no-op once the first demo PO exists.
 */
class DemoUpsManyLotsSeeder extends Seeder
{
    public function run(): void
    {
        $item = StockItem::where('sku', 'SK-UPS-001')->first();
        if (! $item) {
            $this->command?->warn('SK-UPS-001 not found — skipped.');

            return;
        }

        if (StockMovement::where('reference', 'PO-2026-061')->exists()) {
            $this->command?->info('Demo UPS lots already present — skipped.');

            return;
        }

        $balances = app(StockBalanceService::class);
        $lots = app(StockLotService::class);
        $userId = User::where('email', 'it@inaba.co.th')->value('id');

        $warehouses = ['คลังกลาง IT', 'ห้อง Server Room', 'คลังโรงงาน 2'];
        $suppliers = ['JIB Computer Group', 'Synnex Thailand', 'Advice IT', 'SiS Distribution'];
        // Spread the 20 receives over past dates (never the future, or they'd dominate
        // the date-sorted audit log and bury more recent issues).
        $base = Carbon::parse('2026-04-15 09:00:00');

        // Continue the serial sequence after the existing BX1100C-#### units.
        $serialNo = 50;
        $totalUnits = 0;

        DB::transaction(function () use ($item, $balances, $lots, $userId, $warehouses, $suppliers, $base, &$serialNo, &$totalUnits) {
            for ($i = 0; $i < 20; $i++) {
                $qty = ($i % 3) + 1;                 // 1, 2, 3, 1, 2, 3, …
                $cost = 4200 + ($i % 5) * 40;        // 4200–4360, varied per lot
                $warehouse = $warehouses[$i % count($warehouses)];
                $supplier = $suppliers[$i % count($suppliers)];
                $po = sprintf('PO-2026-%03d', 61 + $i);
                $when = (clone $base)->addDays($i);

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

                $item->current_stock += $qty;
                $item->last_move_at = $when->toDateString();
                $item->save();

                $balances->add($item, $warehouse, $qty);
                $lots->addLot($item, $qty, $cost, $movement->id, $when);

                for ($u = 0; $u < $qty; $u++) {
                    $serialNo++;
                    StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => sprintf('BX1100C-%04d', $serialNo),
                        'status' => 'in_stock',
                        'warehouse' => $warehouse,
                        'reference' => $po,
                        'received_at' => $when,
                    ]);
                }

                $totalUnits += $qty;
            }
        });

        $this->command?->info("Added 20 receive lots ({$totalUnits} units) to SK-UPS-001.");
    }
}
