<?php

namespace Database\Seeders;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\Warehouse;
use Illuminate\Database\Seeder;

class MasterDataSeeder extends Seeder
{
    /**
     * The lookup lists the Asset, Stock and Contract forms pick from — the sections
     * below say which. Run by hand on a fresh install, never from DatabaseSeeder:
     * this is one company's reference data, not everybody's.
     *
     * Safe to re-run. Every list matches on its unique `name` and updates in place.
     */
    public function run(): void
    {
        // ── Brands ──────────────────────────────────────────────────────────────
        $brands = [
            ['name' => 'Dell',    'description' => 'Dell Technologies - เซิร์ฟเวอร์, แล็ปท็อป, จอภาพ'],
            ['name' => 'HP',      'description' => 'HP Inc. - เครื่องพิมพ์, แล็ปท็อป, เดสก์ท็อป'],
            ['name' => 'Lenovo',  'description' => 'Lenovo - ThinkPad, ThinkCentre, ThinkStation'],
            ['name' => 'Apple',   'description' => 'Apple Inc. - MacBook, iPad'],
            ['name' => 'Cisco',   'description' => 'Cisco Systems - สวิตช์, เราเตอร์, ไฟร์วอลล์'],
            ['name' => 'Samsung', 'description' => 'Samsung - จอภาพ, SSD, อุปกรณ์มือถือ'],
            ['name' => 'Fujitsu', 'description' => 'Fujitsu - เซิร์ฟเวอร์, สแกนเนอร์'],
            ['name' => 'APC',     'description' => 'APC by Schneider Electric - UPS, PDU'],
            ['name' => 'D-Link',  'description' => 'D-Link - สวิตช์, Access Point ระดับ SMB'],
            ['name' => 'Epson',   'description' => 'Epson - เครื่องพิมพ์, สแกนเนอร์'],
        ];

        $brandMap = [];
        foreach ($brands as $b) {
            $brandMap[$b['name']] = Brand::updateOrCreate(['name' => $b['name']], ['description' => $b['description']]);
        }

        // ── Asset Models ─────────────────────────────────────────────────────────
        $models = [
            ['name' => 'Dell Latitude 5540',           'brand' => 'Dell',    'description' => 'แล็ปท็อปธุรกิจ 15.6" i5/i7 Gen13'],
            ['name' => 'Dell OptiPlex 7010',           'brand' => 'Dell',    'description' => 'เดสก์ท็อป SFF Intel i5 Gen13'],
            ['name' => 'Dell PowerEdge R750',          'brand' => 'Dell',    'description' => 'Rack Server 2U Xeon Scalable'],
            ['name' => 'Dell UltraSharp U2422H',       'brand' => 'Dell',    'description' => 'จอ 24" IPS USB-C'],
            ['name' => 'HP ProBook 450 G10',           'brand' => 'HP',      'description' => 'แล็ปท็อปธุรกิจ 15.6" i5 Gen13'],
            ['name' => 'HP EliteDesk 800 G9',          'brand' => 'HP',      'description' => 'เดสก์ท็อป SFF i7 Gen12'],
            ['name' => 'HP LaserJet Pro 4002dn',       'brand' => 'HP',      'description' => 'เครื่องพิมพ์เลเซอร์ขาวดำ A4'],
            ['name' => 'HP Color LaserJet Pro 4301fdw', 'brand' => 'HP',     'description' => 'เครื่องพิมพ์สีแบบ All-in-One A4'],
            ['name' => 'Lenovo ThinkPad L14 Gen4',    'brand' => 'Lenovo',  'description' => 'แล็ปท็อปธุรกิจ 14" AMD Ryzen 5'],
            ['name' => 'Lenovo ThinkCentre M70q',     'brand' => 'Lenovo',  'description' => 'Mini PC i5 Gen12'],
            ['name' => 'MacBook Air M2 13"',           'brand' => 'Apple',   'description' => 'แล็ปท็อป M2 8GB/256GB'],
            ['name' => 'MacBook Pro M3 14"',           'brand' => 'Apple',   'description' => 'แล็ปท็อป M3 Pro 18GB/512GB'],
            ['name' => 'Cisco Catalyst C9200L-24P',   'brand' => 'Cisco',   'description' => 'Layer 3 Switch 24-port PoE+'],
            ['name' => 'Cisco Meraki MR46',            'brand' => 'Cisco',   'description' => 'Wi-Fi 6 Access Point'],
            ['name' => 'Cisco ASA 5506-X',             'brand' => 'Cisco',   'description' => 'Firewall/VPN Appliance'],
            ['name' => 'Samsung ViewFinity S8 27"',   'brand' => 'Samsung', 'description' => 'จอ 4K IPS 27" USB-C'],
            ['name' => 'APC Smart-UPS 1500VA',         'brand' => 'APC',     'description' => 'UPS 1500VA/1000W Line-interactive'],
            ['name' => 'APC Smart-UPS 3000VA',         'brand' => 'APC',     'description' => 'UPS 3000VA Rack-mount'],
            ['name' => 'Epson L6580',                  'brand' => 'Epson',   'description' => 'เครื่องพิมพ์อิงค์แจ็ต All-in-One A4 Wi-Fi'],
        ];

        foreach ($models as $m) {
            $brand = $brandMap[$m['brand']] ?? null;
            // The brand is its own column, so the name drops it: a list that stored
            // "Dell Latitude 5540" renders as "Dell Dell Latitude 5540".
            $name = str_starts_with($m['name'], $m['brand'].' ')
                ? substr($m['name'], strlen($m['brand']) + 1)
                : $m['name'];
            AssetModel::updateOrCreate(
                ['name' => $name],
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

        // ── Warehouses ──────────────────────────────────────────────────────────
        $warehouses = [
            ['name' => 'คลังโรงงาน 1',      'description' => 'จุดเก็บอุปกรณ์ประจำโรงงานที่ 1'],
            ['name' => 'คลังโรงงาน 2',      'description' => 'จุดเก็บอุปกรณ์ประจำโรงงานที่ 2'],
            ['name' => 'คลังโรงงาน 4',      'description' => 'จุดเก็บอุปกรณ์ประจำโรงงานที่ 4'],
        ];

        foreach ($warehouses as $w) {
            Warehouse::updateOrCreate(['name' => $w['name']], ['description' => $w['description']]);
        }

        // ── Units (Stock module) ──────────────────────────────────────────────────
        $units = [
            ['name' => 'unit', 'description' => 'ชิ้น / เครื่อง'],
            ['name' => 'pc', 'description' => 'ชิ้น'],
            ['name' => 'ea', 'description' => 'อัน'],
            ['name' => 'cartridge', 'description' => 'ตลับ (หมึก/Toner)'],
            ['name' => 'box', 'description' => 'กล่อง'],
            ['name' => 'set', 'description' => 'ชุด'],
            ['name' => 'pack', 'description' => 'แพ็ก'],
            ['name' => 'roll', 'description' => 'ม้วน'],
            ['name' => 'meter', 'description' => 'เมตร'],
            ['name' => 'kg', 'description' => 'กิโลกรัม'],
            ['name' => 'g', 'description' => 'กรัม'],
        ];
        foreach ($units as $u) {
            Unit::updateOrCreate(['name' => $u['name']], ['description' => $u['description']]);
        }

        // ── Warranty types (Stock module) ─────────────────────────────────────────
        $warrantyTypes = [
            ['name' => 'No warranty', 'description' => 'ไม่มีการรับประกัน'],
            ['name' => '1-year', 'description' => 'รับประกัน 1 ปี'],
            ['name' => '2-year', 'description' => 'รับประกัน 2 ปี'],
            ['name' => '3-year', 'description' => 'รับประกัน 3 ปี'],
            ['name' => '5-year', 'description' => 'รับประกัน 5 ปี'],
            ['name' => 'Lifetime', 'description' => 'รับประกันตลอดอายุการใช้งาน'],
        ];
        foreach ($warrantyTypes as $w) {
            WarrantyType::updateOrCreate(['name' => $w['name']], ['description' => $w['description']]);
        }
    }
}
