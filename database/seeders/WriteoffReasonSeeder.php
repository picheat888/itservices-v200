<?php

namespace Database\Seeders;

use App\Models\Settings\WriteoffReason;
use Illuminate\Database\Seeder;

/**
 * The standard write-off reasons every install starts with; administrators edit the list in Settings.
 * Idempotent: firstOrCreate on the unique name keeps an edited description.
 */
class WriteoffReasonSeeder extends Seeder
{
    /** No "คืนผู้ให้เช่า": a rented asset goes back through its own action (returned_to_vendor_at). */
    public const STANDARD = [
        ['name' => 'ชำรุด ซ่อมไม่คุ้ม', 'description' => 'เสียหายจนค่าซ่อมไม่คุ้มกับมูลค่า'],
        ['name' => 'หมดอายุการใช้งาน / ล้าสมัย', 'description' => 'ใช้งานครบอายุ หรือสเปกไม่รองรับงานแล้ว'],
        ['name' => 'สูญหาย / ถูกโจรกรรม', 'description' => null],
        ['name' => 'ขายซาก', 'description' => null],
        ['name' => 'บริจาค', 'description' => null],
        ['name' => 'อื่น ๆ', 'description' => 'ระบุรายละเอียดในหมายเหตุ'],
    ];

    public function run(): void
    {
        foreach (self::STANDARD as $reason) {
            WriteoffReason::firstOrCreate(['name' => $reason['name']], ['description' => $reason['description']]);
        }
    }
}
