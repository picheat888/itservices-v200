<?php

namespace App\Enums\Ticket;

/**
 * ลักษณะของงานบนเคส — ตอบว่า "งานชิ้นนี้ยาวแค่ไหน"
 *
 * คนละคำถามกับ TicketPriority ("ด่วนแค่ไหน" ซึ่งคนกดรับเป็นคนตอบ) และคนละคำถามกับ
 * RequestType ("ขออะไร" ซึ่งคนกรอกฟอร์มตอบก่อนมีใครไปดูของจริง) เคส Network หนึ่งใบ
 * อาจเป็นการตั้งค่า VPN ที่จบใน 2 ชั่วโมง หรือเป็นการเดินสายใหม่ทั้งชั้นที่ใช้เวลาเป็นเดือน
 * และตัวเลขเดียวไม่มีทางพูดแทนทั้งสองอย่างได้
 *
 * Standard เป็นค่าเริ่มต้นของทุกเคส และตั้งใจให้ "ไม่ match กฎไหนเลย" — นั่นคือสิ่งที่ทำให้
 * scope นี้ชนะลำดับบนสุดได้อย่างปลอดภัย: มันมีผลเฉพาะตอนที่มีคนตั้งใจจัดประเภทจริง ๆ
 */
enum TicketWorkClass: string
{
    case Standard = 'standard';
    case RepairInternal = 'repair_internal';
    case RepairVendor = 'repair_vendor';

    /** ป้ายภาษาอังกฤษ สำหรับที่ที่เรนเดอร์นอก SPA เช่นอีเมล */
    public function label(): string
    {
        return match ($this) {
            self::Standard => 'Standard work',
            self::RepairInternal => 'Repair (in-house)',
            self::RepairVendor => 'Repair (vendor)',
        };
    }

    /** งานซ่อมยาวที่วัดด้วย KPI ของตัวเอง ไม่ใช่ SLA ของงานปกติ */
    public function isRepair(): bool
    {
        return $this !== self::Standard;
    }

    /**
     * ค่าของงานซ่อมทั้งหมด เป็นสตริง สำหรับ query builder ที่เทียบกับคอลัมน์ตรง ๆ
     *
     * @return list<string>
     */
    public static function repairValues(): array
    {
        return array_values(array_map(
            fn (self $class) => $class->value,
            array_filter(self::cases(), fn (self $class) => $class->isRepair()),
        ));
    }
}
