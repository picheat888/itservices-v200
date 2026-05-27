<?php

namespace Database\Seeders;

use App\Enums\CategoryType;
use App\Models\AssetModel;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Vendor;
use App\Models\Warehouse;
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
            // Asset
            ['name' => 'แล็ปท็อป',           'type' => CategoryType::Asset,    'description' => 'Notebook / Laptop ทุกยี่ห้อ'],
            ['name' => 'เดสก์ท็อป',          'type' => CategoryType::Asset,    'description' => 'Desktop PC / Mini PC'],
            ['name' => 'เซิร์ฟเวอร์',        'type' => CategoryType::Asset,    'description' => 'Rack / Tower Server'],
            ['name' => 'จอภาพ',              'type' => CategoryType::Asset,    'description' => 'Monitor / Display'],
            ['name' => 'เครื่องพิมพ์',       'type' => CategoryType::Asset,    'description' => 'Printer / MFP / Plotter'],
            ['name' => 'สวิตช์ / เราเตอร์',  'type' => CategoryType::Asset,    'description' => 'Network Switch, Router, AP'],
            ['name' => 'UPS',                'type' => CategoryType::Asset,    'description' => 'Uninterruptible Power Supply'],
            ['name' => 'กล้องวงจรปิด',       'type' => CategoryType::Asset,    'description' => 'CCTV Camera / NVR'],
            ['name' => 'โทรศัพท์',           'type' => CategoryType::Asset,    'description' => 'IP Phone / Mobile / Tablet'],
            ['name' => 'อุปกรณ์อื่น ๆ',      'type' => CategoryType::Asset,    'description' => 'อุปกรณ์ IT ที่ไม่อยู่ในหมวดข้างต้น'],
            // Contract
            ['name' => 'ซอฟต์แวร์ลิขสิทธิ์', 'type' => CategoryType::Contract, 'description' => 'Software license (subscription / perpetual)'],
            ['name' => 'บำรุงรักษา',          'type' => CategoryType::Contract, 'description' => 'Hardware/Software maintenance & support'],
            ['name' => 'เช่าอุปกรณ์',         'type' => CategoryType::Contract, 'description' => 'Device / Equipment rental'],
            ['name' => 'อินเทอร์เน็ต / WAN',  'type' => CategoryType::Contract, 'description' => 'Internet, Leased line, MPLS'],
            ['name' => 'บริการ Cloud',         'type' => CategoryType::Contract, 'description' => 'IaaS / PaaS / SaaS cloud contract'],
            // Stock
            ['name' => 'ตลับหมึก / Toner',    'type' => CategoryType::Stock,    'description' => 'Inkjet cartridge และ Laser toner'],
            ['name' => 'อะไหล่คอมพิวเตอร์',   'type' => CategoryType::Stock,    'description' => 'RAM, SSD, HDD, PSU, CPU'],
            ['name' => 'สายเคเบิล',           'type' => CategoryType::Stock,    'description' => 'LAN, HDMI, DP, USB, Power cable'],
            ['name' => 'อุปกรณ์เสริม',        'type' => CategoryType::Stock,    'description' => 'เมาส์, คีย์บอร์ด, Hub, Adapter'],
            ['name' => 'วัสดุสิ้นเปลือง',     'type' => CategoryType::Stock,    'description' => 'แผ่น CD/DVD, แฟลชไดร์ฟ, กระดาษพิมพ์'],
        ];

        foreach ($categories as $c) {
            Category::updateOrCreate(
                ['name' => $c['name'], 'type' => $c['type']],
                ['description' => $c['description']],
            );
        }

        // ── Vendors ─────────────────────────────────────────────────────────────
        $vendors = [
            [
                'name' => 'บริษัท แอดวานซ์ อินโฟ เซอร์วิส จำกัด (มหาชน)',
                'contact' => 'ฝ่ายลูกค้าองค์กร',
                'phone' => '02-299-5000',
                'email' => 'enterprise@ais.th',
                'address' => '414 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400',
            ],
            [
                'name' => 'บริษัท ไมโครซอฟท์ (ประเทศไทย) จำกัด',
                'contact' => 'Microsoft Enterprise Sales',
                'phone' => '02-844-1000',
                'email' => 'thasales@microsoft.com',
                'address' => '388 อาคาร Exchange Tower ชั้น 30 ถนนสุขุมวิท กรุงเทพฯ 10110',
            ],
            [
                'name' => 'บริษัท ซิสโก้ ซิสเต็มส์ (ประเทศไทย) จำกัด',
                'contact' => 'Cisco Thailand Partner',
                'phone' => '02-632-7999',
                'email' => 'th-partners@cisco.com',
                'address' => '87/2 อาคาร CRC Tower ชั้น 32 ถนนวิทยุ กรุงเทพฯ 10330',
            ],
            [
                'name' => 'บริษัท เดลล์ คอร์ปอเรชั่น (ประเทศไทย) จำกัด',
                'contact' => 'Dell Business Direct',
                'phone' => '02-684-5555',
                'email' => 'th.support@dell.com',
                'address' => '689 อาคาร Bhiraj Tower ชั้น 21 ถนนสุขุมวิท กรุงเทพฯ 10110',
            ],
            [
                'name' => 'บริษัท เอชพี ประเทศไทย จำกัด',
                'contact' => 'HP Enterprise Thailand',
                'phone' => '02-353-9000',
                'email' => 'th.enterprise@hp.com',
                'address' => '195 อาคาร Empire Tower ชั้น 43 ถนนสาทรใต้ กรุงเทพฯ 10120',
            ],
            [
                'name' => 'บริษัท เลโนโว (ประเทศไทย) จำกัด',
                'contact' => 'Lenovo Corporate Sales',
                'phone' => '02-026-4600',
                'email' => 'th.b2b@lenovo.com',
                'address' => 'อาคาร Glas Haus ชั้น 15 ถนนสุขุมวิท 25 กรุงเทพฯ 10110',
            ],
            [
                'name' => 'บริษัท อีซี่บาย จำกัด (มหาชน) — ฝ่ายขายองค์กร',
                'contact' => 'Corporate Account',
                'phone' => '02-685-3888',
                'email' => 'corporate@easybuying.net',
                'address' => '55 อาคาร Wave Place ชั้น 19 ถนนวิทยุ กรุงเทพฯ 10330',
            ],
            [
                'name' => 'ห้างหุ้นส่วนจำกัด ไอที วัน สตอร์',
                'contact' => 'คุณสมชาย วงศ์พาณิชย์',
                'phone' => '038-312-456',
                'email' => 'sales@itonestoreth.com',
                'address' => '99/12 นิคมอุตสาหกรรมอมตะนคร ชลบุรี 20000',
            ],
            [
                'name' => 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
                'contact' => 'True Business Center',
                'phone' => '02-858-5858',
                'email' => 'business@true.th',
                'address' => '18 อาคาร True Tower ถนนรัชดาภิเษก กรุงเทพฯ 10310',
            ],
            [
                'name' => 'บริษัท ซีเอ็ดยูเคชั่น จำกัด (มหาชน) — ฝ่าย IT',
                'contact' => 'ฝ่ายจัดซื้อ IT',
                'phone' => '02-826-8000',
                'email' => 'procurement@se-ed.com',
                'address' => '1858/87-90 ถนนบางนา-ตราด กรุงเทพฯ 10260',
            ],
        ];

        foreach ($vendors as $v) {
            Vendor::updateOrCreate(['name' => $v['name']], [
                'contact' => $v['contact'],
                'phone' => $v['phone'],
                'email' => $v['email'],
                'address' => $v['address'],
            ]);
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
    }
}
