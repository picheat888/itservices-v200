<?php

// Shared layout of report workbook sheets: a data table (bold heading row, frozen, AutoFilter),
// date cells written as real Excel dates, and the file facts an outside auditor checks.

namespace App\Exports\Report;

use App\Models\Settings\AppSetting;
use App\Services\Report\Tabular\CellDate;
use App\Support\DateDisplay;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

final class SheetLayout
{
    /** Excel's sheet name limit. */
    public const TITLE_MAX = 31;

    /** Heading row bold and frozen, AutoFilter over the table. */
    public static function table(Worksheet $sheet, int $headingRow = 1): void
    {
        $lastColumn = $sheet->getHighestDataColumn();
        $lastRow = max($sheet->getHighestDataRow(), $headingRow);
        $sheet->getStyle("A{$headingRow}:{$lastColumn}{$headingRow}")->getFont()->setBold(true);
        $sheet->freezePane('A'.($headingRow + 1));
        $sheet->setAutoFilter("A{$headingRow}:{$lastColumn}{$lastRow}");
    }

    /**
     * Sheet cells of a section's rows: CellDate as an Excel date, the page's "—" as empty; returns the rows plus each date cell's format.
     *
     * @param  list<list<mixed>>  $rows
     * @return array{0: list<list<mixed>>, 1: array<string, string>} rows, cell → number format
     */
    public static function sheetCells(array $rows, int $firstRow): array
    {
        $formats = [];
        foreach ($rows as $r => $cells) {
            foreach ($cells as $c => $cell) {
                if ($cell instanceof CellDate) {
                    $rows[$r][$c] = $cell->excelValue();
                    $formats[Coordinate::stringFromColumnIndex($c + 1).($firstRow + $r)] = $cell->excelFormat();
                } elseif ($cell === '—') {
                    $rows[$r][$c] = null;
                }
            }
        }

        return [$rows, $formats];
    }

    /** @param array<string, string> $formats cell → number format */
    public static function applyFormats(Worksheet $sheet, array $formats): void
    {
        foreach ($formats as $cell => $format) {
            $sheet->getStyle($cell)->getNumberFormat()->setFormatCode($format);
        }
    }

    /**
     * Who made the file, from which system, and how many data rows it holds.
     *
     * @param  list<string>  $omittedColumns  columns the reader's column picker left out
     * @return list<list<string|int>>
     */
    public static function fileFacts(string $exportedBy, int $rowCount, string $dataSheet, array $omittedColumns = []): array
    {
        $facts = [
            ['สร้างเมื่อ', DateDisplay::dateTime(now())],
            ['ส่งออกโดย', $exportedBy],
            ['ระบบ', self::systemName()],
            ["จำนวนแถวในชีต \"{$dataSheet}\"", $rowCount],
        ];
        if ($omittedColumns !== []) {
            $facts[] = ['คอลัมน์ที่ซ่อนไว้ตอนส่งออก', implode(', ', $omittedColumns)];
        }

        return $facts;
    }

    public static function systemName(): string
    {
        return AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk');
    }

    /** @return array<string, string> WithProperties values */
    public static function properties(string $title, string $subject, string $exportedBy): array
    {
        return [
            'creator' => self::systemName(),
            'lastModifiedBy' => $exportedBy,
            'title' => $title,
            'subject' => $subject,
            'company' => (string) AppSetting::get('company_name', ''),
        ];
    }

    public static function title(string $title): string
    {
        return mb_substr($title, 0, self::TITLE_MAX);
    }
}
