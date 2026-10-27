<?php

namespace App\Enums\Stock;

/** Why a counted line differs from the system quantity, and which side of the variance it can explain. */
enum StockCountReason: string
{
    case Lost = 'lost';
    case Broken = 'broken';
    case Used = 'used';
    case Inbound = 'inbound';
    case Returned = 'returned';
    case Miscount = 'miscount';
    case Custom = 'custom';

    /** Whether this reason can explain the given variance (counted minus system). */
    public function fitsVariance(int $variance): bool
    {
        if ($variance === 0) {
            return false;
        }

        return match ($this) {
            self::Lost, self::Broken, self::Used => $variance < 0,
            self::Inbound, self::Returned => $variance > 0,
            self::Miscount, self::Custom => true,
        };
    }

    /** @param  'th'|'en'  $lang */
    public function label(string $lang): string
    {
        $labels = match ($this) {
            self::Lost => ['th' => 'ของหาย', 'en' => 'Lost'],
            self::Broken => ['th' => 'เสียหาย', 'en' => 'Damaged'],
            self::Used => ['th' => 'เบิกไปแล้วไม่ได้บันทึก', 'en' => 'Issued but not recorded'],
            self::Inbound => ['th' => 'รับเข้าแล้วไม่ได้บันทึก', 'en' => 'Received but not recorded'],
            self::Returned => ['th' => 'รับคืนแล้วไม่ได้บันทึก', 'en' => 'Returned but not recorded'],
            self::Miscount => ['th' => 'ใบนับก่อนหน้านับผิด', 'en' => 'Previous count was wrong'],
            self::Custom => ['th' => 'ระบุเอง', 'en' => 'Other'],
        };

        return $labels[$lang] ?? $labels['en'];
    }
}
