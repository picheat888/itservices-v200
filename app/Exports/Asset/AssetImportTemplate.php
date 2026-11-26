<?php

// Builds the asset import .xlsx template (rented or purchased): data sheet with locked header, guide sheet, lists sheet and dropdowns.

namespace App\Exports\Asset;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Support\AssetImportColumns as Columns;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Style\Protection;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssetImportTemplate
{
    private const FILE_NAMES = [
        'rented' => 'asset-import-rental-template.xlsx',
        'purchased' => 'asset-import-purchase-template.xlsx',
    ];

    private const REQUIRED_RED = 'FFC00000';

    private const TEXT_KEYS = ['asset_code', 'tag', 'serial'];

    /** Stream the template for one kind as a download. */
    public function download(string $kind): StreamedResponse
    {
        $book = $this->build($kind);

        return response()->streamDownload(function () use ($book): void {
            IOFactory::createWriter($book, 'Xlsx')->save('php://output');
        }, self::FILE_NAMES[$kind], [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function build(string $kind): Spreadsheet
    {
        $book = new Spreadsheet;
        $data = $book->getActiveSheet();
        $data->setTitle(Columns::DATA_SHEET[$kind]);
        $guide = $book->createSheet();
        $lists = $book->createSheet();

        $listRanges = $this->writeLists($lists);
        $this->writeGuide($guide, $kind);
        $this->writeData($data, $kind, $listRanges);
        $book->setActiveSheetIndex(0);

        return $book;
    }

    /**
     * Lists sheet: one column per master list, header in row 1. Returns list name => absolute range.
     *
     * @return array<string, string>
     */
    private function writeLists(Worksheet $sheet): array
    {
        $sheet->setTitle(Columns::LISTS_SHEET);
        $lists = [
            'categories' => ['ประเภท', Category::query()->orderBy('name')->pluck('name')->all()],
            'brands' => ['ยี่ห้อ', Brand::query()->orderBy('name')->pluck('name')->all()],
            'models' => ['รุ่น', $this->modelLabels()],
            'warehouses' => ['คลัง', Warehouse::query()->orderBy('name')->pluck('name')->all()],
            'vendors' => ['ผู้ขาย', Vendor::query()->orderBy('name')->pluck('name')->all()],
        ];

        $ranges = [];
        $index = 1;
        foreach ($lists as $key => [$title, $values]) {
            $letter = Coordinate::stringFromColumnIndex($index++);
            $sheet->setCellValue("{$letter}1", $title);
            $sheet->getStyle("{$letter}1")->getFont()->setBold(true);
            foreach (array_values($values) as $i => $value) {
                $sheet->setCellValueExplicit($letter.($i + 2), (string) $value, 'str');
            }
            $last = max(2, count($values) + 1);
            $ranges[$key] = "'".Columns::LISTS_SHEET."'!\${$letter}\$2:\${$letter}\${$last}";
            $sheet->getColumnDimension($letter)->setAutoSize(true);
        }

        return $ranges;
    }

    /** @return list<string> models written as "Model (Brand)" */
    private function modelLabels(): array
    {
        return AssetModel::query()->with('brand:id,name')->orderBy('name')->get()
            ->map(fn (AssetModel $model): string => $model->brand ? "{$model->name} ({$model->brand->name})" : $model->name)
            ->all();
    }

    /** Guide sheet: one row per column with required flag, how to fill and an example. */
    private function writeGuide(Worksheet $sheet, string $kind): void
    {
        $sheet->setTitle(Columns::GUIDE_SHEET);
        $sheet->fromArray(['คอลัมน์', 'ต้องกรอก', 'วิธีกรอก', 'ตัวอย่าง'], null, 'A1');
        $sheet->getStyle('A1:D1')->getFont()->setBold(true);

        $row = 2;
        foreach (Columns::for($kind) as $column) {
            $sheet->setCellValueExplicit("A{$row}", Columns::header($column), 'str');
            $sheet->setCellValueExplicit("B{$row}", $column['required'] ? 'ต้องกรอก' : 'ไม่บังคับ', 'str');
            $sheet->setCellValueExplicit("C{$row}", $column['how'], 'str');
            $sheet->setCellValueExplicit("D{$row}", $column['example'], 'str');
            $row++;
        }
        foreach (['A', 'B', 'C', 'D'] as $letter) {
            $sheet->getColumnDimension($letter)->setAutoSize(true);
        }
    }

    /**
     * Data sheet: header in row 1 (required ones bold red), rows 2..MAX_ROWS+1 unlocked with dropdowns.
     *
     * @param  array<string, string>  $listRanges
     */
    private function writeData(Worksheet $sheet, string $kind, array $listRanges): void
    {
        $lastRow = Columns::MAX_ROWS + 1;
        $columns = Columns::for($kind);

        foreach ($columns as $i => $column) {
            $letter = Coordinate::stringFromColumnIndex($i + 1);
            // Column style covers rows 2 and below; row 1 is restyled as locked right after, so no empty cells are created
            $columnStyle = $sheet->getStyle($letter.':'.$letter);
            $columnStyle->getProtection()->setLocked(Protection::PROTECTION_UNPROTECTED);
            if (in_array($column['key'], self::TEXT_KEYS, true)) {
                $columnStyle->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            }
            $header = $sheet->getCell("{$letter}1");
            $header->setValueExplicit(Columns::header($column), 'str');

            $font = $sheet->getStyle("{$letter}1")->getFont();
            $font->setBold($column['required']);
            if ($column['required']) {
                $font->getColor()->setARGB(self::REQUIRED_RED);
            }
            $sheet->getStyle("{$letter}1")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
            $sheet->getStyle("{$letter}1")->getProtection()->setLocked(Protection::PROTECTION_PROTECTED);

            if ($column['list'] !== null) {
                $this->addDropdown($sheet, $letter, $lastRow, $listRanges[$column['list']]);
            }
            $sheet->getColumnDimension($letter)->setWidth(max(14, mb_strlen(Columns::header($column)) + 4));
        }

        $sheet->freezePane('A2');
        $protection = $sheet->getProtection();
        $protection->setSheet(true);
        foreach (['setInsertRows', 'setDeleteRows', 'setSort', 'setAutoFilter', 'setFormatCells'] as $allow) {
            $protection->{$allow}(false);
        }
    }

    private function addDropdown(Worksheet $sheet, string $letter, int $lastRow, string $range): void
    {
        $validation = new DataValidation;
        $validation->setType(DataValidation::TYPE_LIST);
        $validation->setErrorStyle(DataValidation::STYLE_STOP);
        $validation->setAllowBlank(true);
        $validation->setShowDropDown(false);
        $validation->setShowErrorMessage(false);
        $validation->setFormula1($range);
        $sheet->setDataValidation("{$letter}2:{$letter}{$lastRow}", $validation);
    }
}
