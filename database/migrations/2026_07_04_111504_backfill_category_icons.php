<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Seed sensible Lucide icons for the default seeded categories so asset types
     * show a matching icon out of the box. Only fills rows whose icon is still null,
     * matched by name — admins can override any of these from Settings → Master Data.
     *
     * @var array<string, string>
     */
    private array $map = [
        'แล็ปท็อป' => 'Laptop',
        'เดสก์ท็อป' => 'PcCase',
        'เซิร์ฟเวอร์' => 'Server',
        'จอภาพ' => 'Monitor',
        'เครื่องพิมพ์' => 'Printer',
        'สวิตช์ / เราเตอร์' => 'Router',
        'UPS' => 'Battery',
        'กล้องวงจรปิด' => 'Camera',
        'โทรศัพท์' => 'Phone',
        'อุปกรณ์อื่น ๆ' => 'Box',
        'ซอฟต์แวร์ลิขสิทธิ์' => 'Disc',
        'บำรุงรักษา' => 'Wrench',
        'เช่าอุปกรณ์' => 'Package',
        'อินเทอร์เน็ต / WAN' => 'Wifi',
        'บริการ Cloud' => 'Cloud',
        'ตลับหมึก / Toner' => 'Printer',
        'อะไหล่คอมพิวเตอร์' => 'Cpu',
        'สายเคเบิล' => 'Cable',
        'อุปกรณ์เสริม' => 'Package',
        'วัสดุสิ้นเปลือง' => 'Boxes',
    ];

    public function up(): void
    {
        foreach ($this->map as $name => $icon) {
            DB::table('categories')->where('name', $name)->whereNull('icon')->update(['icon' => $icon]);
        }
    }

    public function down(): void
    {
        DB::table('categories')->whereIn('icon', array_values($this->map))->update(['icon' => null]);
    }
};
