<?php

// Builds the asset import .xlsx template (rented or purchased): data sheet with locked header and dropdowns, and the lists sheet they read.

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
        $lists = $book->createSheet();

        $listRanges = $this->writeLists($lists);
        $this->writeData($data, $kind, $listRanges);
        $book->setActiveSheetIndex(0);

        return $book;
    }

    /**
     * Lists sheet: one column per master list, header in row 1. Models sit beside their brand, grouped by brand,
     * so the model dropdown can offer one brand's block. Returns list name => absolute range.
     *
     * @return array<string, string>
     */
    private function writeLists(Worksheet $sheet): array
    {
        $sheet->setTitle(Columns::LISTS_SHEET);
        [$modelNames, $modelBrands] = $this->modelsByBrand();
        $lists = [
            'categories' => ['ประเภท', Category::query()->orderBy('name')->pluck('name')->all()],
            'brands' => ['ยี่ห้อ', Brand::query()->orderBy('name')->pluck('name')->all()],
            'models' => ['รุ่น', $modelNames],
            'model_brands' => ['ยี่ห้อของรุ่น', $modelBrands],
            'warehouses' => ['คลัง', Warehouse::query()->orderBy('name')->pluck('name')->all()],
            'vendors' => ['ผู้ขาย', Vendor::query()->orderBy('name')->pluck('name')->all()],
        ];

        $ranges = [];
        $index = 1;
        foreach ($lists as $key => [$title, $values]) {
            $letter = Coordinate::stringFromColumnIndex($index++);
            $sheet->setCellValue("{$letter}1", $title);
            foreach (array_values($values) as $i => $value) {
                $sheet->setCellValueExplicit($letter.($i + 2), (string) $value, 'str');
            }
            $last = max(2, count($values) + 1);
            $ranges[$key] = "'".Columns::LISTS_SHEET."'!\${$letter}\$2:\${$letter}\${$last}";
            $sheet->getColumnDimension($letter)->setAutoSize(true);
        }

        return $ranges;
    }

    /**
     * Models that have a brand, grouped by brand name then model name, as two parallel columns.
     *
     * @return array{0: list<string>, 1: list<string>} model names and the brand of each
     */
    private function modelsByBrand(): array
    {
        $models = AssetModel::query()->with('brand:id,name')->whereNotNull('brand_id')->get()
            ->filter(fn (AssetModel $model): bool => $model->brand !== null)
            ->sort(fn (AssetModel $a, AssetModel $b): int => [$a->brand->name, $a->name] <=> [$b->brand->name, $b->name])
            ->values();

        return [$models->pluck('name')->all(), $models->map(fn (AssetModel $model): string => $model->brand->name)->all()];
    }

    /**
     * List formula for the model column: the block of models whose brand equals the brand cell of the same row.
     * Excel shifts the relative row of the brand cell for every row of the validation range.
     *
     * @param  array<string, string>  $listRanges
     */
    private function modelsOfRowBrand(array $listRanges, string $brandLetter): string
    {
        $firstModel = strstr($listRanges['models'], ':', true);
        $brands = $listRanges['model_brands'];
        $brandCell = "\${$brandLetter}2";

        return "OFFSET({$firstModel},MATCH({$brandCell},{$brands},0)-1,0,COUNTIF({$brands},{$brandCell}),1)";
    }

    /**
     * Data sheet: plain header in row 1, rows 2..MAX_ROWS+1 unlocked with dropdowns.
     *
     * @param  array<string, string>  $listRanges
     */
    private function writeData(Worksheet $sheet, string $kind, array $listRanges): void
    {
        $lastRow = Columns::MAX_ROWS + 1;
        $columns = Columns::for($kind);
        $brandLetter = Coordinate::stringFromColumnIndex((int) array_search('brand', array_column($columns, 'key'), true) + 1);

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

            $sheet->getStyle("{$letter}1")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
            $sheet->getStyle("{$letter}1")->getProtection()->setLocked(Protection::PROTECTION_PROTECTED);

            if ($column['list'] === 'models') {
                $this->addDropdown($sheet, $letter, $lastRow, $this->modelsOfRowBrand($listRanges, $brandLetter));
            } elseif ($column['list'] !== null) {
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
        $validation->setShowDropDown(true);
        $validation->setShowErrorMessage(false);
        $validation->setFormula1($range);
        $sheet->setDataValidation("{$letter}2:{$letter}{$lastRow}", $validation);
    }
}
