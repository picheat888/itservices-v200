<?php

namespace App\Services\Report;

/**
 * Thai display labels for ticket enum values, used only where a report renders under a
 * Thai heading and must not leak the raw enum value (e.g. "in_progress"): the Excel/PDF
 * exports in App\Exports\Report and resources/views/pdf/reports/ticket-overview.blade.php.
 * The React app translates the same values through lang/<locale>/report.ts instead.
 */
final class TicketLabels
{
    /** @var array<string, string> */
    private const PRIORITY_TH = [
        'critical' => 'วิกฤต',
        'high' => 'สูง',
        'medium' => 'ปานกลาง',
        'low' => 'ต่ำ',
    ];

    /** @var array<string, string> */
    private const STATUS_TH = [
        'open' => 'เปิด',
        'in_progress' => 'กำลังดำเนินการ',
        'completed' => 'เสร็จสิ้น',
        'canceled' => 'ยกเลิก',
    ];

    /** @var array<string, string> */
    private const CATEGORY_TH = [
        'hardware' => 'ฮาร์ดแวร์',
        'software' => 'ซอฟต์แวร์',
        'network' => 'เครือข่าย',
        'cctv' => 'กล้องวงจรปิด',
        'telephone' => 'โทรศัพท์',
        'other' => 'อื่น ๆ',
    ];

    public static function priority(?string $value): ?string
    {
        return $value === null ? null : (self::PRIORITY_TH[$value] ?? $value);
    }

    public static function status(?string $value): ?string
    {
        return $value === null ? null : (self::STATUS_TH[$value] ?? $value);
    }

    public static function category(?string $value): ?string
    {
        return $value === null ? null : (self::CATEGORY_TH[$value] ?? $value);
    }
}
