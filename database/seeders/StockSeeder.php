<?php

namespace Database\Seeders;

use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\StockRequest;
use App\Models\User;
use Illuminate\Database\Seeder;

class StockSeeder extends Seeder
{
    /**
     * Seeds demo IT stock items (idempotent via SKU), movement history,
     * and requests covering all statuses: pending, approved, fulfilled, rejected.
     * Warehouse names match those seeded in MasterDataSeeder.
     * Min/max and last-move dates are intentionally set so the dashboard
     * surfaces every health state: ok, low, out, over, dead.
     */
    public function run(): void
    {
        $hq  = 'คลังกลาง IT';
        $pl1 = 'คลังโรงงาน 1';
        $pl2 = 'คลังโรงงาน 2';

        // [sku, name, serial, category, brand, model, unit, cost, current, min, max, warehouse, supplier, lastMove, warranty]
        $items = [
            ['SK-NB-001', 'Lenovo ThinkPad T14 Gen 3',        null,         'แล็ปท็อป',              'Lenovo',   'ThinkPad T14 G3',   'unit',      38500,  2,  3, 10, $hq,  'Inet Solutions',                                          '2026-05-18', '3-year onsite'],
            ['SK-NB-002', 'Dell Latitude 5440',                null,         'แล็ปท็อป',              'Dell',     'Latitude 5440',     'unit',      32100,  5,  2,  8, $hq,  'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด',            '2026-05-20', '3-year onsite'],
            ['SK-PC-001', 'Dell OptiPlex 3000 SFF',            null,         'เดสก์ท็อป',             'Dell',     'OptiPlex 3000',     'unit',      21500,  4,  2,  8, $hq,  'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด',            '2026-05-12', '3-year onsite'],
            ['SK-RAM-001', 'Kingston 8GB DDR4-3200 SODIMM',    null,         'อะไหล่คอมพิวเตอร์',    'Kingston', 'KCP432SS8/8',       'module',      850, 14, 10, 40, $hq,  'Synnex Thailand',                                         '2026-05-20', 'Lifetime'],
            ['SK-RAM-002', 'Crucial 16GB DDR4-3200 DIMM',      null,         'อะไหล่คอมพิวเตอร์',    'Crucial',  'CT16G4DFRA32A',     'module',     1490,  6,  6, 20, $hq,  'Synnex Thailand',                                         '2026-05-15', 'Lifetime'],
            ['SK-SSD-001', 'Samsung 970 EVO Plus 500GB NVMe',  null,         'อะไหล่คอมพิวเตอร์',    'Samsung',  'MZ-V7S500BW',       'drive',      2100,  1,  5, 20, $hq,  'JIB Computer Group',                                      '2026-05-21', '5-year'],
            ['SK-MOU-001', 'Logitech M331 Silent Plus',        null,         'อุปกรณ์เสริม',          'Logitech', 'M331',              'unit',        590, 38, 10, 30, $hq,  'Office Mate',                                             '2026-04-12', '1-year'],
            ['SK-MOU-002', 'Dell MS116 Optical Mouse',         null,         'อุปกรณ์เสริม',          'Dell',     'MS116',             'unit',        320,  4,  8, 25, $hq,  'Office Mate',                                             '2026-02-14', '1-year'],
            ['SK-KB-001',  'Logitech K120 USB Keyboard',       null,         'อุปกรณ์เสริม',          'Logitech', 'K120',              'unit',        450, 22,  8, 30, $hq,  'Office Mate',                                             '2026-05-15', '1-year'],
            ['SK-SW-001',  'Cisco Catalyst 1300-24P PoE',      'FCW2725G123','สวิตช์ / เราเตอร์',    'Cisco',    'C1300-24P-4G',      'unit',      28500,  1,  1,  3, $pl1, 'Inet Solutions',                                          '2026-03-20', 'Limited Lifetime'],
            ['SK-AP-001',  'Ubiquiti UniFi U6-Lite',           null,         'สวิตช์ / เราเตอร์',    'Ubiquiti', 'U6-Lite',           'unit',       3990,  7,  4, 15, $pl1, 'Inet Solutions',                                          '2026-05-10', '1-year'],
            ['SK-CB-001',  'Cat6 UTP Patch Cable 2m (Blue)',   null,         'สายเคเบิล',             'Link',     'US-5142',           'piece',        75, 85, 50, 200,$hq,  'Synnex Thailand',                                         '2026-05-18', 'No warranty'],
            ['SK-CB-002',  'HDMI 2.0 Cable 1.8m',              null,         'สายเคเบิล',             'Belkin',   'F3Y020bt',          'piece',       220,  0,  5, 20, $hq,  'Office Mate',                                             '2026-01-18', 'No warranty'],
            ['SK-UPS-001', 'APC Back-UPS BX1100C-MS 1100VA',  'AS2503312045','UPS',                  'APC',      'BX1100C-MS',        'unit',       4290,  3,  2,  6, $pl2, 'JIB Computer Group',                                      '2026-05-08', '2-year'],
            ['SK-TON-001', 'HP 26A Black LaserJet Toner',      null,         'ตลับหมึก / Toner',     'HP',       'CF226A',            'cartridge',  3200,  0,  3,  8, $hq,  'Advice IT',                                               '2026-04-30', 'No warranty'],
            ['SK-TON-002', 'Canon 057 Black Toner',            null,         'ตลับหมึก / Toner',     'Canon',    '057',               'cartridge',  2800,  6,  2,  6, $hq,  'Advice IT',                                               '2026-05-05', 'No warranty'],
        ];

        $skuMap = [];
        foreach ($items as $row) {
            [$sku, $name, $serial, $category, $brand, $model, $unit, $cost, $current, $min, $max, $warehouse, $supplier, $lastMove, $warranty] = $row;

            $item = StockItem::updateOrCreate(['sku' => $sku], [
                'name'          => $name,
                'serial'        => $serial,
                'category'      => $category,
                'brand'         => $brand,
                'model'         => $model,
                'unit'          => $unit,
                'cost'          => $cost,
                'current_stock' => $current,
                'min_stock'     => $min,
                'max_stock'     => $max,
                'warehouse'     => $warehouse,
                'supplier'      => $supplier,
                'warranty'      => $warranty,
                'last_move_at'  => $lastMove,
            ]);

            $skuMap[$sku] = $item->id;
        }

        $this->seedMovements($skuMap);
        $this->seedRequests($skuMap);
    }

    /**
     * Seeds representative movement history (receive / issue / return / transfer).
     * Skipped entirely if the table already has records (idempotent).
     */
    private function seedMovements(array $skuMap): void
    {
        if (StockMovement::count() > 0) {
            return;
        }

        $itUser = User::where('email', 'it@inaba.co.th')->value('id');

        // [sku, type, qty, from, to, reference, recorded_by, notes, moved_at]
        $movements = [
            // --- Lenovo ThinkPad T14 (current=2, low < min=3) ---
            ['SK-NB-001', 'receive',  5, 'Inet Solutions',  'คลังกลาง IT', 'PO-2026-003', 'Kanya Phakdee',    'รับสินค้าตาม PO ใหม่',                         '2026-03-01 09:00:00'],
            ['SK-NB-001', 'issue',    3, 'คลังกลาง IT',     'แผนกขาย',     'TK-2026-120', 'Kanya Phakdee',    'เปลี่ยนเครื่องพนักงานขาย 3 คน',               '2026-05-18 14:00:00'],

            // --- Dell Latitude 5440 (current=5, ok) ---
            ['SK-NB-002', 'receive',  8, 'เดลล์ ประเทศไทย', 'คลังกลาง IT', 'PO-2026-004', 'Kanya Phakdee',    'รับสินค้าตาม PO',                              '2026-04-01 10:00:00'],
            ['SK-NB-002', 'issue',    3, 'คลังกลาง IT',     'แผนก HR',      'TK-2026-150', 'Kanya Phakdee',    'เปลี่ยนเครื่อง HR ชำรุด',                      '2026-05-20 11:30:00'],

            // --- Kingston 8GB RAM (current=14, ok) ---
            ['SK-RAM-001', 'receive', 20, 'Synnex Thailand', 'คลังกลาง IT', 'PO-2026-001', 'Kanya Phakdee',    'ซื้อเพิ่มสต็อก RAM ประจำไตรมาส',              '2026-01-15 09:30:00'],
            ['SK-RAM-001', 'issue',    3, 'คลังกลาง IT',     'แผนก IT',     'TK-2026-045', 'Kanya Phakdee',    'อัปเกรด RAM เครื่อง staff',                    '2026-02-20 13:00:00'],
            ['SK-RAM-001', 'issue',    3, 'คลังกลาง IT',     'แผนกบัญชี',  'TK-2026-089', 'Kanya Phakdee',    'เพิ่ม RAM เครื่อง Accounting 3 เครื่อง',      '2026-03-10 10:00:00'],

            // --- Samsung 970 EVO SSD (current=1, low < min=5) ---
            ['SK-SSD-001', 'receive', 10, 'JIB Computer',   'คลังกลาง IT', 'PO-2026-002', 'Kanya Phakdee',    'รับ SSD ล็อตใหม่',                              '2026-02-01 09:00:00'],
            ['SK-SSD-001', 'issue',    5, 'คลังกลาง IT',     'แผนก IT',     'TK-2026-022', 'Kanya Phakdee',    'เปลี่ยน SSD เครื่องเสีย',                      '2026-03-15 14:00:00'],
            ['SK-SSD-001', 'issue',    4, 'คลังกลาง IT',     'แผนกผลิต',   'TK-2026-201', 'Kanya Phakdee',    'อัปเกรดเครื่อง Production 4 เครื่อง',         '2026-05-21 15:30:00'],

            // --- Logitech M331 Mouse (current=38, over max=30) ---
            ['SK-MOU-001', 'receive', 50, 'Office Mate',     'คลังกลาง IT', 'PO-2025-087', 'Kanya Phakdee',    'สั่งซื้อล็อตใหญ่ลดต้นทุน',                    '2025-09-01 09:00:00'],
            ['SK-MOU-001', 'issue',   12, 'คลังกลาง IT',     'แผนกทั่วไป',  'TK-2025-312', 'Kanya Phakdee',    'แจกเมาส์ใหม่พนักงานประจำปี',                  '2025-10-15 11:00:00'],

            // --- Dell MS116 Mouse (current=4, low < min=8) ---
            ['SK-MOU-002', 'receive', 15, 'Office Mate',     'คลังกลาง IT', 'PO-2025-068', 'Kanya Phakdee',    'รับสินค้าตาม PO',                              '2025-12-01 09:00:00'],
            ['SK-MOU-002', 'issue',    5, 'คลังกลาง IT',     'แผนก HR',     'TK-2026-030', 'Kanya Phakdee',    'เมาส์เสีย เปลี่ยนใหม่',                        '2026-01-20 10:00:00'],
            ['SK-MOU-002', 'issue',    6, 'คลังกลาง IT',     'แผนกขาย',    'TK-2026-071', 'Kanya Phakdee',    'พนักงานขายใหม่ 6 คน',                          '2026-02-14 14:00:00'],

            // --- Logitech K120 Keyboard (current=22, ok — with return example) ---
            ['SK-KB-001',  'receive', 30, 'Office Mate',     'คลังกลาง IT', 'PO-2026-006', 'Kanya Phakdee',    'สั่งซื้อคีย์บอร์ดรอบใหม่',                    '2026-03-01 09:00:00'],
            ['SK-KB-001',  'issue',   12, 'คลังกลาง IT',     'แผนกทั่วไป',  'TK-2026-095', 'Kanya Phakdee',    'แจกพนักงานแผนกทั่วไป',                        '2026-04-15 10:30:00'],
            ['SK-KB-001',  'return',   4, 'แผนกทั่วไป',      'คลังกลาง IT', 'RTN-2026-001','Kanya Phakdee',    'คืน 4 ชิ้น เนื่องจากพนักงานลาออก',            '2026-05-15 13:00:00'],

            // --- Ubiquiti UniFi AP (transfer example) ---
            ['SK-AP-001',  'receive', 10, 'Inet Solutions',  'คลังกลาง IT', 'PO-2026-005', 'Kanya Phakdee',    'รับ Access Point ล็อตใหม่',                    '2026-04-10 09:00:00'],
            ['SK-AP-001',  'transfer', 3, 'คลังกลาง IT',    'คลังโรงงาน 1','TRF-2026-001','Kanya Phakdee',    'โอนไปติดตั้งโรงงาน 1',                        '2026-05-10 11:00:00'],

            // --- Cat6 Patch Cable (current=85, ok) ---
            ['SK-CB-001',  'receive',100, 'Synnex Thailand', 'คลังกลาง IT', 'PO-2026-007', 'Kanya Phakdee',    'สต็อกสายแลนประจำปี',                           '2026-03-05 09:00:00'],
            ['SK-CB-001',  'issue',   15, 'คลังกลาง IT',     'แผนก IT',     'TK-2026-110', 'Kanya Phakdee',    'ต่อสายระบบเครือข่ายชั้น 3',                   '2026-04-20 14:00:00'],

            // --- HDMI Cable (current=0, out of stock) ---
            ['SK-CB-002',  'receive', 10, 'Office Mate',     'คลังกลาง IT', 'PO-2025-099', 'Kanya Phakdee',    'รับสินค้า HDMI',                               '2025-11-01 09:00:00'],
            ['SK-CB-002',  'issue',   10, 'คลังกลาง IT',     'ห้องประชุม',  'TK-2026-010', 'Kanya Phakdee',    'ติดตั้งห้องประชุม 4 ห้อง',                     '2026-01-18 10:00:00'],

            // --- HP 26A Toner (current=0, out of stock) ---
            ['SK-TON-001', 'receive',  5, 'Advice IT',       'คลังกลาง IT', 'PO-2025-112', 'Kanya Phakdee',    'รับ Toner HP ล็อตใหม่',                        '2025-10-01 09:00:00'],
            ['SK-TON-001', 'issue',    3, 'คลังกลาง IT',     'ห้องพิมพ์งาน','TK-2025-445', 'Kanya Phakdee',    'เปลี่ยน Toner Printer ชั้น 2',                '2025-12-10 10:00:00'],
            ['SK-TON-001', 'issue',    2, 'คลังกลาง IT',     'ห้องพิมพ์งาน','TK-2026-175', 'Kanya Phakdee',    'เปลี่ยน Toner Printer ชั้น 1 และ 3',         '2026-04-30 13:00:00'],

            // --- Canon 057 Toner (current=6, ok) ---
            ['SK-TON-002', 'receive',  8, 'Advice IT',       'คลังกลาง IT', 'PO-2026-008', 'Kanya Phakdee',    'รับ Toner Canon ล็อตใหม่',                     '2026-04-20 09:00:00'],
            ['SK-TON-002', 'issue',    2, 'คลังกลาง IT',     'ห้องพิมพ์งาน','TK-2026-188', 'Kanya Phakdee',    'เปลี่ยน Toner ชั้น 4',                        '2026-05-05 11:00:00'],
        ];

        foreach ($movements as [$sku, $type, $qty, $from, $to, $ref, $by, $notes, $movedAt]) {
            if (! isset($skuMap[$sku])) {
                continue;
            }

            StockMovement::create([
                'stock_item_id' => $skuMap[$sku],
                'type'          => $type,
                'qty'           => $qty,
                'from_label'    => $from,
                'to_label'      => $to,
                'reference'     => $ref,
                'recorded_by'   => $by,
                'user_id'       => $itUser,
                'notes'         => $notes,
                'moved_at'      => $movedAt,
            ]);
        }
    }

    /**
     * Seeds stock requests covering all statuses: pending, approved, fulfilled, rejected.
     * Skipped entirely if the table already has records (idempotent).
     */
    private function seedRequests(array $skuMap): void
    {
        if (StockRequest::count() > 0) {
            return;
        }

        $userUser = User::where('email', 'user@inaba.co.th')->value('id');
        $hrUser   = User::where('email', 'hr@inaba.co.th')->value('id');

        // [sku, user_id, requester_name, dept, qty, reason, status, approver, approved_at, fulfilled_at, rejected_at]
        $requests = [
            // Pending — รอการอนุมัติ
            [
                'sku'          => 'SK-RAM-002',
                'user_id'      => $userUser,
                'requester'    => 'Pimchanok Wongwai',
                'dept'         => 'แผนกบัญชี',
                'qty'          => 2,
                'reason'       => 'เครื่องคอมแผนกบัญชีช้ามากต้องการอัปเกรด RAM เพิ่ม 2 ชิ้น',
                'status'       => 'pending',
                'approver'     => null,
                'approved_at'  => null,
                'fulfilled_at' => null,
                'rejected_at'  => null,
            ],
            [
                'sku'          => 'SK-MOU-002',
                'user_id'      => $hrUser,
                'requester'    => 'Ratana Klinprathum',
                'dept'         => 'แผนก HR',
                'qty'          => 3,
                'reason'       => 'เมาส์ชำรุด 3 ชิ้น ขอเบิกทดแทน',
                'status'       => 'pending',
                'approver'     => null,
                'approved_at'  => null,
                'fulfilled_at' => null,
                'rejected_at'  => null,
            ],

            // Approved — อนุมัติแล้ว รอจ่ายของ
            [
                'sku'          => 'SK-SSD-001',
                'user_id'      => $userUser,
                'requester'    => 'Pimchanok Wongwai',
                'dept'         => 'แผนกผลิต',
                'qty'          => 1,
                'reason'       => 'เครื่องคอมห้อง CAD ฮาร์ดดิสก์เสีย ต้องการ SSD ทดแทนด่วน',
                'status'       => 'approved',
                'approver'     => 'Kanya Phakdee',
                'approved_at'  => '2026-05-22 10:00:00',
                'fulfilled_at' => null,
                'rejected_at'  => null,
            ],

            // Fulfilled — จ่ายของแล้ว
            [
                'sku'          => 'SK-KB-001',
                'user_id'      => $hrUser,
                'requester'    => 'Ratana Klinprathum',
                'dept'         => 'แผนก HR',
                'qty'          => 5,
                'reason'       => 'พนักงานใหม่เข้างาน 5 คน ต้องการคีย์บอร์ด',
                'status'       => 'fulfilled',
                'approver'     => 'Kanya Phakdee',
                'approved_at'  => '2026-04-10 09:30:00',
                'fulfilled_at' => '2026-04-11 14:00:00',
                'rejected_at'  => null,
            ],
            [
                'sku'          => 'SK-RAM-001',
                'user_id'      => $userUser,
                'requester'    => 'Pimchanok Wongwai',
                'dept'         => 'แผนกบัญชี',
                'qty'          => 3,
                'reason'       => 'อัปเกรด RAM เครื่อง Staff บัญชีที่ใช้โปรแกรม ERP',
                'status'       => 'fulfilled',
                'approver'     => 'Wichai Suwannarat',
                'approved_at'  => '2026-03-08 10:00:00',
                'fulfilled_at' => '2026-03-10 11:30:00',
                'rejected_at'  => null,
            ],

            // Rejected — ปฏิเสธ
            [
                'sku'          => 'SK-NB-001',
                'user_id'      => $hrUser,
                'requester'    => 'Ratana Klinprathum',
                'dept'         => 'แผนก HR',
                'qty'          => 3,
                'reason'       => 'ต้องการโน้ตบุ๊คใหม่สำหรับห้องสัมภาษณ์งาน 3 เครื่อง',
                'status'       => 'rejected',
                'approver'     => 'Wichai Suwannarat',
                'approved_at'  => null,
                'fulfilled_at' => null,
                'rejected_at'  => '2026-05-19 09:00:00',
            ],
        ];

        foreach ($requests as $r) {
            if (! isset($skuMap[$r['sku']])) {
                continue;
            }

            StockRequest::create([
                'stock_item_id' => $skuMap[$r['sku']],
                'user_id'       => $r['user_id'],
                'requester_name'=> $r['requester'],
                'dept'          => $r['dept'],
                'qty'           => $r['qty'],
                'reason'        => $r['reason'],
                'status'        => $r['status'],
                'approver_name' => $r['approver'],
                'approved_at'   => $r['approved_at'],
                'fulfilled_at'  => $r['fulfilled_at'],
                'rejected_at'   => $r['rejected_at'],
            ]);
        }
    }
}
