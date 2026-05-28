<?php

namespace Database\Seeders;

use App\Models\AssetModel;
use App\Models\Brand;
use App\Models\Category;
use App\Models\StockStatus;
use App\Models\Unit;
use App\Models\Vendor;
use App\Models\Warehouse;
use App\Models\WarrantyType;
use Illuminate\Database\Seeder;

class MasterDataSeeder extends Seeder
{
    /**
     * Seeds demo master data: Brands, Asset Models, Categories, Vendors, Warehouses.
     * Idempotent via updateOrCreate on name (unique column).
     */
    public function run(): void
    {
        // ── Brands ──────────────────────────────────────────────────────────────
        $brands = [
            ['name' => 'Dell',    'description' => 'Dell Technologies — เซิร์ฟเวอร์, แล็ปท็อป, จอภาพ'],
            ['name' => 'HP',      'description' => 'HP Inc. — เครื่องพิมพ์, แล็ปท็อป, เดสก์ท็อป'],
            ['name' => 'Lenovo',  'description' => 'Lenovo — ThinkPad, ThinkCentre, ThinkStation'],
            ['name' => 'Apple',   'description' => 'Apple Inc. — MacBook, iPad'],
            ['name' => 'Cisco',   'description' => 'Cisco Systems — สวิตช์, เราเตอร์, ไฟร์วอลล์'],
            ['name' => 'Samsung', 'description' => 'Samsung — จอภาพ, SSD, อุปกรณ์มือถือ'],
            ['name' => 'Fujitsu', 'description' => 'Fujitsu — เซิร์ฟเวอร์, สแกนเนอร์'],
            ['name' => 'APC',     'description' => 'APC by Schneider Electric — UPS, PDU'],
            ['name' => 'D-Link',  'description' => 'D-Link — สวิตช์, Access Point ระดับ SMB'],
            ['name' => 'Epson',   'description' => 'Epson — เครื่องพิมพ์, สแกนเนอร์'],
        ];

        $brandMap = [];
        foreach ($brands as $b) {
            $brandMap[$b['name']] = Brand::updateOrCreate(['name' => $b['name']], ['description' => $b['description']]);
        }

        // ── Asset Models ─────────────────────────────────────────────────────────
        $models = [
            // Dell
            ['name' => 'Dell Latitude 5540',           'brand' => 'Dell',    'description' => 'แล็ปท็อปธุรกิจ 15.6" i5/i7 Gen13'],
            ['name' => 'Dell OptiPlex 7010',           'brand' => 'Dell',    'description' => 'เดสก์ท็อป SFF Intel i5 Gen13'],
            ['name' => 'Dell PowerEdge R750',          'brand' => 'Dell',    'description' => 'Rack Server 2U Xeon Scalable'],
            ['name' => 'Dell UltraSharp U2422H',       'brand' => 'Dell',    'description' => 'จอ 24" IPS USB-C'],
            // HP
            ['name' => 'HP ProBook 450 G10',           'brand' => 'HP',      'description' => 'แล็ปท็อปธุรกิจ 15.6" i5 Gen13'],
            ['name' => 'HP EliteDesk 800 G9',          'brand' => 'HP',      'description' => 'เดสก์ท็อป SFF i7 Gen12'],
            ['name' => 'HP LaserJet Pro 4002dn',       'brand' => 'HP',      'description' => 'เครื่องพิมพ์เลเซอร์ขาวดำ A4'],
            ['name' => 'HP Color LaserJet Pro 4301fdw', 'brand' => 'HP',     'description' => 'เครื่องพิมพ์สีแบบ All-in-One A4'],
            // Lenovo
            ['name' => 'Lenovo ThinkPad L14 Gen4',    'brand' => 'Lenovo',  'description' => 'แล็ปท็อปธุรกิจ 14" AMD Ryzen 5'],
            ['name' => 'Lenovo ThinkCentre M70q',     'brand' => 'Lenovo',  'description' => 'Mini PC i5 Gen12'],
            // Apple
            ['name' => 'MacBook Air M2 13"',           'brand' => 'Apple',   'description' => 'แล็ปท็อป M2 8GB/256GB'],
            ['name' => 'MacBook Pro M3 14"',           'brand' => 'Apple',   'description' => 'แล็ปท็อป M3 Pro 18GB/512GB'],
            // Cisco
            ['name' => 'Cisco Catalyst C9200L-24P',   'brand' => 'Cisco',   'description' => 'Layer 3 Switch 24-port PoE+'],
            ['name' => 'Cisco Meraki MR46',            'brand' => 'Cisco',   'description' => 'Wi-Fi 6 Access Point'],
            ['name' => 'Cisco ASA 5506-X',             'brand' => 'Cisco',   'description' => 'Firewall/VPN Appliance'],
            // Samsung
            ['name' => 'Samsung ViewFinity S8 27"',   'brand' => 'Samsung', 'description' => 'จอ 4K IPS 27" USB-C'],
            // APC
            ['name' => 'APC Smart-UPS 1500VA',         'brand' => 'APC',     'description' => 'UPS 1500VA/1000W Line-interactive'],
            ['name' => 'APC Smart-UPS 3000VA',         'brand' => 'APC',     'description' => 'UPS 3000VA Rack-mount'],
            // Epson
            ['name' => 'Epson L6580',                  'brand' => 'Epson',   'description' => 'เครื่องพิมพ์อิงค์แจ็ต All-in-One A4 Wi-Fi'],
        ];

        foreach ($models as $m) {
            $brand = $brandMap[$m['brand']] ?? null;
            AssetModel::updateOrCreate(
                ['name' => $m['name']],
                ['brand_id' => $brand?->id, 'description' => $m['description']],
            );
        }

        // ── Categories ──────────────────────────────────────────────────────────
        $categories = [
            ['name' => 'แล็ปท็อป',           'description' => 'Notebook / Laptop ทุกยี่ห้อ'],
            ['name' => 'เดสก์ท็อป',          'description' => 'Desktop PC / Mini PC'],
            ['name' => 'เซิร์ฟเวอร์',        'description' => 'Rack / Tower Server'],
            ['name' => 'จอภาพ',              'description' => 'Monitor / Display'],
            ['name' => 'เครื่องพิมพ์',       'description' => 'Printer / MFP / Plotter'],
            ['name' => 'สวิตช์ / เราเตอร์',  'description' => 'Network Switch, Router, AP'],
            ['name' => 'UPS',                'description' => 'Uninterruptible Power Supply'],
            ['name' => 'กล้องวงจรปิด',       'description' => 'CCTV Camera / NVR'],
            ['name' => 'โทรศัพท์',           'description' => 'IP Phone / Mobile / Tablet'],
            ['name' => 'อุปกรณ์อื่น ๆ',      'description' => 'อุปกรณ์ IT ที่ไม่อยู่ในหมวดข้างต้น'],
            ['name' => 'ซอฟต์แวร์ลิขสิทธิ์', 'description' => 'Software license (subscription / perpetual)'],
            ['name' => 'บำรุงรักษา',          'description' => 'Hardware/Software maintenance & support'],
            ['name' => 'เช่าอุปกรณ์',         'description' => 'Device / Equipment rental'],
            ['name' => 'อินเทอร์เน็ต / WAN',  'description' => 'Internet, Leased line, MPLS'],
            ['name' => 'บริการ Cloud',         'description' => 'IaaS / PaaS / SaaS cloud contract'],
            ['name' => 'ตลับหมึก / Toner',    'description' => 'Inkjet cartridge และ Laser toner'],
            ['name' => 'อะไหล่คอมพิวเตอร์',   'description' => 'RAM, SSD, HDD, PSU, CPU'],
            ['name' => 'สายเคเบิล',           'description' => 'LAN, HDMI, DP, USB, Power cable'],
            ['name' => 'อุปกรณ์เสริม',        'description' => 'เมาส์, คีย์บอร์ด, Hub, Adapter'],
            ['name' => 'วัสดุสิ้นเปลือง',     'description' => 'แผ่น CD/DVD, แฟลชไดร์ฟ, กระดาษพิมพ์'],
        ];

        foreach ($categories as $c) {
            Category::updateOrCreate(
                ['name' => $c['name']],
                ['description' => $c['description']],
            );
        }

        // ── Vendors ─────────────────────────────────────────────────────────────
        // `name` holds the English vendor name, `name_th` the Thai one, so the UI
        // can show either depending on the active language. `old` is the legacy
        // Thai-only `name` from earlier seeds — used to update existing rows in
        // place rather than creating duplicates when re-seeding a live database.
        $vendors = [
            [
                'old' => 'บริษัท แอดวานซ์ อินโฟ เซอร์วิส จำกัด (มหาชน)',
                'name' => 'Advanced Info Service PCL (AIS)',
                'name_th' => 'บริษัท แอดวานซ์ อินโฟ เซอร์วิส จำกัด (มหาชน)',
                'contact' => 'ฝ่ายลูกค้าองค์กร',
                'phone' => '02-299-5000',
                'email' => 'enterprise@ais.th',
                'address' => '414 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400',
            ],
            [
                'old' => 'บริษัท ไมโครซอฟท์ (ประเทศไทย) จำกัด',
                'name' => 'Microsoft (Thailand) Limited',
                'name_th' => 'บริษัท ไมโครซอฟท์ (ประเทศไทย) จำกัด',
                'contact' => 'Microsoft Enterprise Sales',
                'phone' => '02-844-1000',
                'email' => 'thasales@microsoft.com',
                'address' => '388 อาคาร Exchange Tower ชั้น 30 ถนนสุขุมวิท กรุงเทพฯ 10110',
            ],
            [
                'old' => 'บริษัท ซิสโก้ ซิสเต็มส์ (ประเทศไทย) จำกัด',
                'name' => 'Cisco Systems (Thailand) Limited',
                'name_th' => 'บริษัท ซิสโก้ ซิสเต็มส์ (ประเทศไทย) จำกัด',
                'contact' => 'Cisco Thailand Partner',
                'phone' => '02-632-7999',
                'email' => 'th-partners@cisco.com',
                'address' => '87/2 อาคาร CRC Tower ชั้น 32 ถนนวิทยุ กรุงเทพฯ 10330',
            ],
            [
                'old' => 'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด',
                'name' => 'Dell Corporation (Thailand) Limited',
                'name_th' => 'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด',
                'contact' => 'Dell Business Direct',
                'phone' => '02-684-5555',
                'email' => 'th.support@dell.com',
                'address' => '689 อาคาร Bhiraj Tower ชั้น 21 ถนนสุขุมวิท กรุงเทพฯ 10110',
            ],
            [
                'old' => 'บริษัท เอชพี ประเทศไทย จำกัด',
                'name' => 'HP (Thailand) Co., Ltd.',
                'name_th' => 'บริษัท เอชพี ประเทศไทย จำกัด',
                'contact' => 'HP Enterprise Thailand',
                'phone' => '02-353-9000',
                'email' => 'th.enterprise@hp.com',
                'address' => '195 อาคาร Empire Tower ชั้น 43 ถนนสาทรใต้ กรุงเทพฯ 10120',
            ],
            [
                'old' => 'บริษัท เลโนโว (ประเทศไทย) จำกัด',
                'name' => 'Lenovo (Thailand) Limited',
                'name_th' => 'บริษัท เลโนโว (ประเทศไทย) จำกัด',
                'contact' => 'Lenovo Corporate Sales',
                'phone' => '02-026-4600',
                'email' => 'th.b2b@lenovo.com',
                'address' => 'อาคาร Glas Haus ชั้น 15 ถนนสุขุมวิท 25 กรุงเทพฯ 10110',
            ],
            [
                'old' => 'บริษัท อีซี่บาย จำกัด (มหาชน) — ฝ่ายขายองค์กร',
                'name' => 'EasyBuy PCL — Corporate Sales',
                'name_th' => 'บริษัท อีซี่บาย จำกัด (มหาชน) — ฝ่ายขายองค์กร',
                'contact' => 'Corporate Account',
                'phone' => '02-685-3888',
                'email' => 'corporate@easybuying.net',
                'address' => '55 อาคาร Wave Place ชั้น 19 ถนนวิทยุ กรุงเทพฯ 10330',
            ],
            [
                'old' => 'ห้างหุ้นส่วนจำกัด ไอที วัน สตอร์',
                'name' => 'IT One Store Ltd., Part.',
                'name_th' => 'ห้างหุ้นส่วนจำกัด ไอที วัน สตอร์',
                'contact' => 'คุณสมชาย วงศ์พาณิชย์',
                'phone' => '038-312-456',
                'email' => 'sales@itonestoreth.com',
                'address' => '99/12 นิคมอุตสาหกรรมอมตะนคร ชลบุรี 20000',
            ],
            [
                'old' => 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
                'name' => 'True Corporation PCL',
                'name_th' => 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
                'contact' => 'True Business Center',
                'phone' => '02-858-5858',
                'email' => 'business@true.th',
                'address' => '18 อาคาร True Tower ถนนรัชดาภิเษก กรุงเทพฯ 10310',
            ],
            [
                'old' => 'บริษัท ซีเอ็ดยูเคชั่น จำกัด (มหาชน) — ฝ่าย IT',
                'name' => 'SE-Education PCL — IT Dept.',
                'name_th' => 'บริษัท ซีเอ็ดยูเคชั่น จำกัด (มหาชน) — ฝ่าย IT',
                'contact' => 'ฝ่ายจัดซื้อ IT',
                'phone' => '02-826-8000',
                'email' => 'procurement@se-ed.com',
                'address' => '1858/87-90 ถนนบางนา-ตราด กรุงเทพฯ 10260',
            ],
        ];

        foreach ($vendors as $v) {
            // Match a legacy Thai-named row or an already-migrated English-named
            // row so re-seeding updates in place instead of duplicating.
            $vendor = Vendor::where('name', $v['old'])->orWhere('name', $v['name'])->first();
            $attributes = [
                'name' => $v['name'],
                'name_th' => $v['name_th'],
                'contact' => $v['contact'],
                'phone' => $v['phone'],
                'email' => $v['email'],
                'address' => $v['address'],
            ];

            if ($vendor) {
                $vendor->update($attributes);
            } else {
                Vendor::create($attributes);
            }
        }

        // ── Warehouses ──────────────────────────────────────────────────────────
        $warehouses = [
            ['name' => 'คลังกลาง IT',      'description' => 'ห้องคลังอุปกรณ์ IT หลัก อาคาร A ชั้น 1'],
            ['name' => 'ห้อง Server Room',  'description' => 'ห้องควบคุม Server และอุปกรณ์ Network หลัก'],
            ['name' => 'คลังโรงงาน 1',      'description' => 'จุดเก็บอุปกรณ์ประจำโรงงานที่ 1'],
            ['name' => 'คลังโรงงาน 2',      'description' => 'จุดเก็บอุปกรณ์ประจำโรงงานที่ 2'],
            ['name' => 'คลังอะไหล่สำรอง',   'description' => 'อะไหล่และวัสดุสำรองสำหรับซ่อมบำรุง'],
        ];

        foreach ($warehouses as $w) {
            Warehouse::updateOrCreate(['name' => $w['name']], ['description' => $w['description']]);
        }

        // ── Units (Stock module) ──────────────────────────────────────────────────
        $units = [
            ['name' => 'unit', 'description' => 'ชิ้น / เครื่อง'],
            ['name' => 'piece', 'description' => 'ชิ้น'],
            ['name' => 'module', 'description' => 'โมดูล (เช่น RAM)'],
            ['name' => 'drive', 'description' => 'ไดรฟ์ (SSD/HDD)'],
            ['name' => 'cartridge', 'description' => 'ตลับ (หมึก/Toner)'],
            ['name' => 'box', 'description' => 'กล่อง'],
            ['name' => 'set', 'description' => 'ชุด'],
        ];
        foreach ($units as $u) {
            Unit::updateOrCreate(['name' => $u['name']], ['description' => $u['description']]);
        }

        // ── Stock statuses (item condition — Stock module) ────────────────────────
        $stockStatuses = [
            ['name' => 'New', 'description' => 'ของใหม่ ยังไม่เปิดใช้งาน'],
            ['name' => 'Used', 'description' => 'ผ่านการใช้งานแล้ว'],
            ['name' => 'Refurbished', 'description' => 'ปรับสภาพใหม่'],
            ['name' => 'Damaged', 'description' => 'ชำรุด รอซ่อม/ตัดจำหน่าย'],
            ['name' => 'Reserved', 'description' => 'จองไว้สำหรับงาน/โครงการ'],
        ];
        foreach ($stockStatuses as $s) {
            StockStatus::updateOrCreate(['name' => $s['name']], ['description' => $s['description']]);
        }

        // ── Warranty types (Stock module) ─────────────────────────────────────────
        $warrantyTypes = [
            ['name' => 'No warranty', 'description' => 'ไม่มีการรับประกัน'],
            ['name' => '1-year', 'description' => 'รับประกัน 1 ปี'],
            ['name' => '2-year', 'description' => 'รับประกัน 2 ปี'],
            ['name' => '3-year onsite', 'description' => 'รับประกัน 3 ปี บริการถึงที่'],
            ['name' => '5-year', 'description' => 'รับประกัน 5 ปี'],
            ['name' => 'Lifetime', 'description' => 'รับประกันตลอดอายุการใช้งาน'],
            ['name' => 'Limited Lifetime', 'description' => 'รับประกันตลอดอายุแบบมีเงื่อนไข'],
        ];
        foreach ($warrantyTypes as $w) {
            WarrantyType::updateOrCreate(['name' => $w['name']], ['description' => $w['description']]);
        }
    }
}
