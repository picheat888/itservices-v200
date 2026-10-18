<?php

// A date in a report file cell: Excel writes it as a real date (ISO format), the PDF prints it
// with the date setting. Report sections put these in their rows instead of formatted text.

namespace App\Services\Report\Tabular;

use App\Support\DateDisplay;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

final class CellDate
{
    public const DATE_FORMAT = 'yyyy-mm-dd';

    public const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm';

    public const MONTH_FORMAT = 'yyyy-mm';

    private function __construct(public readonly CarbonInterface $at, public readonly string $kind) {}

    public static function date(CarbonInterface|string|null $value): ?self
    {
        return self::make($value, 'date');
    }

    public static function dateTime(CarbonInterface|string|null $value): ?self
    {
        return self::make($value, 'datetime');
    }

    /** A calendar month ("2026-10"); the cell holds its first day. */
    public static function month(CarbonInterface|string|null $value): ?self
    {
        return self::make($value, 'month');
    }

    /** The Excel serial number of a date: whole days for a date, a fraction for the time. */
    public static function serial(CarbonInterface $at, bool $withTime): float
    {
        return (float) ExcelDate::PHPToExcel($withTime ? $at : $at->copy()->startOfDay());
    }

    public function excelValue(): float
    {
        return self::serial($this->kind === 'month' ? $this->at->copy()->startOfMonth() : $this->at, $this->kind === 'datetime');
    }

    public function excelFormat(): string
    {
        return match ($this->kind) {
            'datetime' => self::DATETIME_FORMAT,
            'month' => self::MONTH_FORMAT,
            default => self::DATE_FORMAT,
        };
    }

    /** The PDF's text, in the date setting. */
    public function display(): string
    {
        return match ($this->kind) {
            'datetime' => DateDisplay::dateTime($this->at),
            'month' => DateDisplay::monthYear($this->at),
            default => DateDisplay::date($this->at),
        };
    }

    private static function make(CarbonInterface|string|null $value, string $kind): ?self
    {
        if ($value === null || $value === '') {
            return null;
        }
        // Wall time as written, like DateDisplay: an offset in the text is ignored
        $text = is_string($value) ? substr(str_replace('T', ' ', trim($value)), 0, 19) : null;
        $at = $value instanceof CarbonInterface ? $value : CarbonImmutable::parse(strlen($text) === 7 ? "{$text}-01" : $text);

        return new self($at, $kind);
    }
}
