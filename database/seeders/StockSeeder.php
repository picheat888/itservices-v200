<?php

namespace Database\Seeders;

use App\Models\StockItem;
use Illuminate\Database\Seeder;

class StockSeeder extends Seeder
{
    /**
     * Seeds demo IT stock items (idempotent via SKU). Warehouse names match the
     * warehouses seeded in MasterDataSeeder. Min/max and last-move dates are set
     * so the dashboard surfaces every state: healthy, below-min, out, overstock
     * and dead stock.
     */
    public function run(): void
    {
        $hq = 'คลังกลาง IT';
        $pl1 = 'คลังโรงงาน 1';
        $pl2 = 'คลังโรงงาน 2';

        // [sku, name, serial, category, brand, model, unit, cost, current, min, max, warehouse, supplier, lastMove, warranty]
        $items = [
            ['SK-NB-001', 'Lenovo ThinkPad T14 Gen 3', null, 'แล็ปท็อป', 'Lenovo', 'ThinkPad T14 G3', 'unit', 38500, 2, 3, 10, $hq, 'Inet Solutions', '2026-05-18', '3-year onsite'],
            ['SK-NB-002', 'Dell Latitude 5440', null, 'แล็ปท็อป', 'Dell', 'Latitude 5440', 'unit', 32100, 5, 2, 8, $hq, 'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด', '2026-05-20', '3-year onsite'],
            ['SK-PC-001', 'Dell OptiPlex 3000 SFF', null, 'เดสก์ท็อป', 'Dell', 'OptiPlex 3000', 'unit', 21500, 4, 2, 8, $hq, 'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด', '2026-05-12', '3-year onsite'],
            ['SK-RAM-001', 'Kingston 8GB DDR4-3200 SODIMM', null, 'อะไหล่คอมพิวเตอร์', 'Kingston', 'KCP432SS8/8', 'module', 850, 14, 10, 40, $hq, 'Synnex Thailand', '2026-05-20', 'Lifetime'],
            ['SK-RAM-002', 'Crucial 16GB DDR4-3200 DIMM', null, 'อะไหล่คอมพิวเตอร์', 'Crucial', 'CT16G4DFRA32A', 'module', 1490, 6, 6, 20, $hq, 'Synnex Thailand', '2026-05-15', 'Lifetime'],
            ['SK-SSD-001', 'Samsung 970 EVO Plus 500GB NVMe', null, 'อะไหล่คอมพิวเตอร์', 'Samsung', 'MZ-V7S500BW', 'drive', 2100, 1, 5, 20, $hq, 'JIB Computer Group', '2026-05-21', '5-year'],
            ['SK-MOU-001', 'Logitech M331 Silent Plus', null, 'อุปกรณ์เสริม', 'Logitech', 'M331', 'unit', 590, 38, 10, 30, $hq, 'Office Mate', '2026-04-12', '1-year'],
            ['SK-MOU-002', 'Dell MS116 Optical Mouse', null, 'อุปกรณ์เสริม', 'Dell', 'MS116', 'unit', 320, 4, 8, 25, $hq, 'Office Mate', '2026-02-14', '1-year'],
            ['SK-KB-001', 'Logitech K120 USB Keyboard', null, 'อุปกรณ์เสริม', 'Logitech', 'K120', 'unit', 450, 22, 8, 30, $hq, 'Office Mate', '2026-05-15', '1-year'],
            ['SK-SW-001', 'Cisco Catalyst 1300-24P PoE', 'FCW2725G123', 'สวิตช์ / เราเตอร์', 'Cisco', 'C1300-24P-4G', 'unit', 28500, 1, 1, 3, $pl1, 'Inet Solutions', '2026-03-20', 'Limited Lifetime'],
            ['SK-AP-001', 'Ubiquiti UniFi U6-Lite', null, 'สวิตช์ / เราเตอร์', 'Ubiquiti', 'U6-Lite', 'unit', 3990, 7, 4, 15, $pl1, 'Inet Solutions', '2026-05-10', '1-year'],
            ['SK-CB-001', 'Cat6 UTP Patch Cable 2m (Blue)', null, 'สายเคเบิล', 'Link', 'US-5142', 'piece', 75, 85, 50, 200, $hq, 'Synnex Thailand', '2026-05-18', 'No warranty'],
            ['SK-CB-002', 'HDMI 2.0 Cable 1.8m', null, 'สายเคเบิล', 'Belkin', 'F3Y020bt', 'piece', 220, 0, 5, 20, $hq, 'Office Mate', '2026-01-18', 'No warranty'],
            ['SK-UPS-001', 'APC Back-UPS BX1100C-MS 1100VA', 'AS2503312045', 'UPS', 'APC', 'BX1100C-MS', 'unit', 4290, 3, 2, 6, $pl2, 'JIB Computer Group', '2026-05-08', '2-year'],
            ['SK-TON-001', 'HP 26A Black LaserJet Toner', null, 'ตลับหมึก / Toner', 'HP', 'CF226A', 'cartridge', 3200, 0, 3, 8, $hq, 'Advice IT', '2026-04-30', 'No warranty'],
            ['SK-TON-002', 'Canon 057 Black Toner', null, 'ตลับหมึก / Toner', 'Canon', '057', 'cartridge', 2800, 6, 2, 6, $hq, 'Advice IT', '2026-05-05', 'No warranty'],
        ];

        foreach ($items as $row) {
            [$sku, $name, $serial, $category, $brand, $model, $unit, $cost, $current, $min, $max, $warehouse, $supplier, $lastMove, $warranty] = $row;

            StockItem::updateOrCreate(['sku' => $sku], [
                'name' => $name,
                'serial' => $serial,
                'category' => $category,
                'brand' => $brand,
                'model' => $model,
                'unit' => $unit,
                'cost' => $cost,
                'current_stock' => $current,
                'min_stock' => $min,
                'max_stock' => $max,
                'warehouse' => $warehouse,
                'supplier' => $supplier,
                'warranty' => $warranty,
                'last_move_at' => $lastMove,
            ]);
        }
    }
}
