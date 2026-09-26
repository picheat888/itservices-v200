<?php

namespace Database\Seeders;

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
            ['name' => 'Brother', 'description' => 'Brother - เครื่องพิมพ์, เครื่องมัลติฟังก์ชัน'],
            ['name' => 'TP-Link', 'description' => 'TP-Link - สวิตช์, เราเตอร์, Access Point ระดับ SMB'],
            ['name' => 'Asus',    'description' => 'Asus - แล็ปท็อป, เดสก์ท็อป, จอภาพ'],
            ['name' => 'Acer',    'description' => 'Acer - แล็ปท็อป, เดสก์ท็อป, จอภาพ'],
            ['name' => 'Microsoft', 'description' => 'Microsoft - Surface, ซอฟต์แวร์และบริการคลาวด์'],
            ['name' => 'VMware', 'description' => 'VMware - ซอฟต์แวร์เวอร์ชวลไลเซชันและคลาวด์'],
            ['name' => 'Oracle',  'description' => 'Oracle - ซอฟต์แวร์ฐานข้อมูลและคลาวด์'],
            ['name' => 'Adobe',   'description' => 'Adobe - ซอฟต์แวร์กราฟิกและมัลติมีเดีย'],
            ['name' => 'Autodesk', 'description' => 'Autodesk - ซอฟต์แวร์ออกแบบและวิศวกรรม'],
            ['name' => 'Symantec', 'description' => 'Symantec - ซอฟต์แวร์ความปลอดภัยและป้องกันไวรัส'],
            ['name' => 'McAfee',  'description' => 'McAfee - ซอฟต์แวร์ความปลอดภัยและป้องกันไวรัส'],
            ['name' => 'Kaspersky', 'description' => 'Kaspersky - ซอฟต์แวร์ความปลอดภัยและป้องกันไวรัส'],
            ['name' => 'Trend Micro', 'description' => 'Trend Micro - ซอฟต์แวร์ความปลอดภัยและป้องกันไวรัส'],
            ['name' => 'Fortinet', 'description' => 'Fortinet - ไฟร์วอลล์และอุปกรณ์ความปลอดภัยเครือข่าย'],
            ['name' => 'Palo Alto Networks', 'description' => 'Palo Alto Networks - ไฟร์วอลล์และอุปกรณ์ความปลอดภัยเครือข่าย'],
            ['name' => 'SATO', 'description' => 'SATO - เครื่องพิมพ์บาร์โค้ดและอุปกรณ์ติดฉลาก'],
            ['name' => 'Zebra', 'description' => 'Zebra Technologies - เครื่องพิมพ์บาร์โค้ดและอุปกรณ์ติดฉลาก'],
            ['name' => 'Honeywell', 'description' => 'Honeywell - เครื่องพิมพ์บาร์โค้ดและอุปกรณ์ติดฉลาก'],
            ['name' => 'Keyence', 'description' => 'Keyence - เครื่องพิมพ์บาร์โค้ดและอุปกรณ์ติดฉลาก'],
            ['name' => 'Ricoh', 'description' => 'Ricoh - เครื่องพิมพ์, เครื่องมัลติฟังก์ชัน, สแกนเนอร์'],
            ['name' => 'Canon', 'description' => 'Canon - เครื่องพิมพ์, เครื่องมัลติฟังก์ชัน, สแกนเนอร์'],
            ['name' => 'Grandstream', 'description' => 'Grandstream Networks - โทรศัพท์ IP, อุปกรณ์ VoIP และระบบเครือข่าย'],
            ['name' => 'Yealink', 'description' => 'Yealink - โทรศัพท์ IP, อุปกรณ์ VoIP และระบบเครือข่าย'],
            ['name' => 'Poly', 'description' => 'Poly (Plantronics + Polycom) - โทรศัพท์ IP, อุปกรณ์ VoIP และระบบเครือข่าย'],
            ['name' => 'HPE', 'description' => 'Hewlett Packard Enterprise - เซิร์ฟเวอร์, สตอเรจ, อุปกรณ์เครือข่าย'],
            ['name' => 'Aruba', 'description' => 'Aruba Networks - สวิตช์, เราเตอร์, Access Point ระดับองค์กร'],
            ['name' => 'Ubiquiti', 'description' => 'Ubiquiti Networks - สวิตช์, เราเตอร์, Access Point ระดับ SMB และบ้าน'],
            ['name' => 'Synology', 'description' => 'Synology - NAS, เซิร์ฟเวอร์จัดเก็บข้อมูลและระบบสำรองข้อมูล'],
            ['name' => 'QNAP', 'description' => 'QNAP - NAS, เซิร์ฟเวอร์จัดเก็บข้อมูลและระบบสำรองข้อมูล'],
            ['name' => 'Western Digital', 'description' => 'Western Digital - ฮาร์ดดิสก์, SSD และอุปกรณ์จัดเก็บข้อมูล'],
            ['name' => 'Seagate', 'description' => 'Seagate Technology - ฮาร์ดดิสก์, SSD และอุปกรณ์จัดเก็บข้อมูล'],
            ['name' => 'Kingston', 'description' => 'Kingston Technology - แรม, SSD และอุปกรณ์จัดเก็บข้อมูล'],
        ];

        foreach ($brands as $b) {
            Brand::updateOrCreate(['name' => $b['name']], ['description' => $b['description']]);
        }

        // ── Categories ──────────────────────────────────────────────────────────
        $categories = [
            // Assets — physical equipment on the register
            ['name' => 'Laptop',            'name_th' => 'แล็ปท็อป',           'icon' => 'Laptop',  'description' => 'โน้ตบุ๊ก / แล็ปท็อป ทุกยี่ห้อ'],
            ['name' => 'Desktop',           'name_th' => 'เดสก์ท็อป',          'icon' => 'PcCase',  'description' => 'เครื่องคอมพิวเตอร์ตั้งโต๊ะ และ Mini PC'],
            ['name' => 'Server',            'name_th' => 'เซิร์ฟเวอร์',        'icon' => 'Server',  'description' => 'เซิร์ฟเวอร์แบบ Rack และ Tower'],
            ['name' => 'Monitor',           'name_th' => 'จอภาพ',              'icon' => 'Monitor', 'description' => 'จอคอมพิวเตอร์และจอแสดงผล'],
            ['name' => 'Printer',           'name_th' => 'เครื่องพิมพ์',       'icon' => 'Printer', 'description' => 'เครื่องพิมพ์ เครื่องมัลติฟังก์ชัน และ Plotter'],
            ['name' => 'Switch / Router',   'name_th' => 'สวิตช์ / เราเตอร์',  'icon' => 'Router',  'description' => 'อุปกรณ์เครือข่าย สวิตช์ เราเตอร์ และ Access Point'],
            ['name' => 'UPS',               'name_th' => 'เครื่องสำรองไฟ',     'icon' => 'Battery', 'description' => 'เครื่องสำรองไฟฟ้าและ PDU'],
            ['name' => 'CCTV',              'name_th' => 'กล้องวงจรปิด',       'icon' => 'Video',  'description' => 'กล้องวงจรปิดและเครื่องบันทึก NVR'],
            ['name' => 'Phone',             'name_th' => 'โทรศัพท์',           'icon' => 'Phone',   'description' => 'โทรศัพท์ IP มือถือ และแท็บเล็ต'],
            ['name' => 'Other equipment',   'name_th' => 'อุปกรณ์อื่น ๆ',      'icon' => 'Package', 'description' => 'อุปกรณ์ไอทีที่ไม่อยู่ในหมวดข้างต้น'],

            // Contracts — what is paid for rather than owned
            ['name' => 'Software licence',  'name_th' => 'ซอฟต์แวร์ลิขสิทธิ์', 'icon' => 'Key',     'description' => 'ลิขสิทธิ์ซอฟต์แวร์ ทั้งแบบรายปีและซื้อขาด'],
            ['name' => 'Maintenance',       'name_th' => 'บำรุงรักษา',         'icon' => 'Wrench',  'description' => 'สัญญาบำรุงรักษาและบริการหลังการขาย'],
            ['name' => 'Equipment rental',  'name_th' => 'เช่าอุปกรณ์',        'icon' => 'Truck',   'description' => 'การเช่าเครื่องและอุปกรณ์'],
            ['name' => 'Internet / WAN',    'name_th' => 'อินเทอร์เน็ต / WAN', 'icon' => 'Network', 'description' => 'อินเทอร์เน็ต วงจรเช่า และ MPLS'],
            ['name' => 'Cloud service',     'name_th' => 'บริการคลาวด์',       'icon' => 'Cloud',   'description' => 'บริการคลาวด์ IaaS PaaS และ SaaS'],

            // Stock — counted, issued and replenished
            ['name' => 'Toner / Cartridge', 'name_th' => 'ตลับหมึก / Toner',   'icon' => 'Box',     'description' => 'ตลับหมึกอิงค์เจ็ตและผงหมึกเลเซอร์'],
            ['name' => 'Computer parts',    'name_th' => 'อะไหล่คอมพิวเตอร์',  'icon' => 'Cpu',     'description' => 'แรม SSD ฮาร์ดดิสก์ พาวเวอร์ซัพพลาย และซีพียู'],
            ['name' => 'Cable',             'name_th' => 'สายเคเบิล',          'icon' => 'Cable',   'description' => 'สายแลน HDMI DisplayPort USB และสายไฟ'],
            ['name' => 'Accessories',       'name_th' => 'อุปกรณ์เสริม',       'icon' => 'Mouse',   'description' => 'เมาส์ คีย์บอร์ด ฮับ และอะแดปเตอร์'],
            ['name' => 'Consumables',       'name_th' => 'วัสดุสิ้นเปลือง',    'icon' => 'Boxes',   'description' => 'แผ่นซีดี ดีวีดี แฟลชไดรฟ์ และกระดาษพิมพ์'],
        ];

        foreach ($categories as $c) {
            Category::updateOrCreate(
                ['name' => $c['name']],
                ['name_th' => $c['name_th'], 'icon' => $c['icon'], 'description' => $c['description']],
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
