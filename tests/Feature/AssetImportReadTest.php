<?php

// Reading an uploaded asset import file: rows by header name, text-as-seen cells, and refusals for files that are not the template.

namespace Tests\Feature;

use App\Services\Asset\AssetImportReader;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use Tests\Concerns\MakesXlsxUploads;
use Tests\TestCase;

class AssetImportReadTest extends TestCase
{
    use MakesXlsxUploads;

    private const RENTED = 'ทรัพย์สินเช่า';

    private const PURCHASED = 'ทรัพย์สินซื้อ';

    /** @return list<string> */
    private function rentedHeader(): array
    {
        return ['ประเภท (Type)', 'ยี่ห้อ (Brand)', 'รุ่น (Model)', 'Serial (Serial No.)', 'Tag', 'คลัง (Warehouse)'];
    }

    private function reader(): AssetImportReader
    {
        return app(AssetImportReader::class);
    }

    private function save(Spreadsheet $book): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        IOFactory::createWriter($book, 'Xlsx')->save($path);

        return new UploadedFile($path, 'assets.xlsx', null, null, true);
    }

    /** @return array<string, mixed> */
    private function refusalOf(UploadedFile $file, string $kind): array
    {
        try {
            $this->reader()->read($file, $kind);
        } catch (ValidationException $e) {
            return $e->response->getData(true);
        }
        $this->fail('Expected a refusal.');
    }

    public function test_it_reads_rows_by_header_name_not_position(): void
    {
        $file = $this->xlsxUpload([self::RENTED => [
            ['Serial', 'Tag', 'ประเภท', 'ยี่ห้อ', 'รุ่น', 'คลัง'],
            ['SN-1', 'T-1', 'Notebook', 'Lenovo', 'E14', 'Main'],
            ['SN-2', 'T-2', 'Notebook', 'Lenovo', 'E14', 'Main'],
        ]]);

        $result = $this->reader()->read($file, 'rented');

        $this->assertSame([2, 3], array_column($result['rows'], 'line'));
        $this->assertSame('SN-1', $result['rows'][0]['cells']['serial']);
        $this->assertSame('T-1', $result['rows'][0]['cells']['tag']);
        $this->assertSame('E14', $result['rows'][0]['cells']['model']);
        $this->assertSame([], $result['ignored']);
    }

    public function test_cells_come_back_as_the_text_the_user_sees(): void
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle(self::PURCHASED);
        $headers = ['ประเภท', 'ยี่ห้อ', 'รุ่น', 'Serial', 'คลัง', 'ราคาซื้อ', 'ผู้ขาย', 'วันที่ซื้อ', 'สิ้นสุดวันรับประกัน'];
        foreach ($headers as $i => $text) {
            $sheet->setCellValue([$i + 1, 1], $text);
        }
        $sheet->setCellValue('A2', 'Notebook');
        $sheet->setCellValue('B2', 'Lenovo');
        $sheet->setCellValue('C2', 'E14');
        $sheet->setCellValueExplicit('D2', 123456789012345, DataType::TYPE_NUMERIC);
        $sheet->setCellValue('E2', '  Main  ');
        $sheet->setCellValue('F2', 28500);
        $sheet->setCellValue('G2', 'IT City');
        $sheet->setCellValue('H2', 46338);
        $sheet->getStyle('H2')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_DATE_DDMMYYYY);
        $sheet->setCellValue('I2', '11/11/2029');
        $sheet->setCellValue('A3', 'Notebook');
        $sheet->setCellValueExplicit('D3', '000123', DataType::TYPE_STRING);

        $rows = $this->reader()->read($this->save($book), 'purchased')['rows'];

        $this->assertSame('123456789012345', $rows[0]['cells']['serial']);
        $this->assertSame('Main', $rows[0]['cells']['warehouse']);
        $this->assertSame('28500', $rows[0]['cells']['value']);
        $this->assertSame('2026-11-12', $rows[0]['cells']['purchase_date']);
        $this->assertSame('11/11/2029', $rows[0]['cells']['warranty_end']);
        $this->assertSame('000123', $rows[1]['cells']['serial']);
    }

    public function test_blank_and_formatted_trailing_rows_are_skipped_and_formulas_read_their_value(): void
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle(self::RENTED);
        $sheet->fromArray([$this->rentedHeader()], null, 'A1', true);
        $sheet->fromArray([['Notebook', 'Lenovo', 'E14', 'SN-1', 'T-1', 'Main']], null, 'A2', true);
        $sheet->setCellValue('A3', 'Notebook');
        $sheet->setCellValue('D3', '=D2');
        $sheet->getStyle('A5:F20')->getFont()->setBold(true);
        $sheet->getStyle('A5:F20')->getNumberFormat()->setFormatCode('@');

        $rows = $this->reader()->read($this->save($book), 'rented')['rows'];

        $this->assertSame([2, 3], array_column($rows, 'line'));
        $this->assertSame('SN-1', $rows[1]['cells']['serial']);
    }

    public function test_formulas_read_the_result_excel_saved_not_a_recalculation(): void
    {
        $file = $this->xlsxWithFormulas([self::RENTED => [
            $this->rentedHeader(),
            ['Notebook', 'Lenovo', 'E14', 'placeholder', 'T-1', 'Main'],
            ['Notebook', 'Lenovo', 'E14', 'placeholder', 'T-2', 'Main'],
        ]], [
            'D2' => ['_xlfn.LET(_xlpm.x,"SN-LET",_xlpm.x)', 'SN-LET'],
            'D3' => ['_xlfn.XLOOKUP("T-2",E2:E3,E2:E3)', 'SN-LOOKUP'],
        ]);

        $rows = $this->reader()->read($file, 'rented')['rows'];

        $this->assertSame('SN-LET', $rows[0]['cells']['serial']);
        $this->assertSame('SN-LOOKUP', $rows[1]['cells']['serial']);
    }

    public function test_excel_errors_and_broken_formulas_read_as_blank(): void
    {
        $file = $this->xlsxWithFormulas([self::RENTED => [
            $this->rentedHeader(),
            ['placeholder', 'Lenovo', 'E14', 'placeholder', 'T-1', 'Main'],
            ['placeholder', 'Lenovo', 'E14', 'placeholder', 'T-2', 'Main'],
            ['placeholder', 'Lenovo', 'E14', 'SN-4', 'T-3', 'placeholder'],
        ]], [
            'A2' => ['NA()', '#N/A', 'e'],
            'D2' => ['NOSUCHFN()', null],
            'A3' => ['1/0', null],
            'D3' => ['SUM(', null],
            'A4' => ['_xlfn.LET(x,1,x)', '#NAME?', 'e'],
            'F4' => ['Lists!A1', '#REF!', 'e'],
        ]);

        $rows = $this->reader()->read($file, 'rented')['rows'];

        $this->assertSame(['', ''], [$rows[0]['cells']['category'], $rows[0]['cells']['serial']]);
        $this->assertSame(['', ''], [$rows[1]['cells']['category'], $rows[1]['cells']['serial']]);
        $this->assertSame(['', 'SN-4', ''], [$rows[2]['cells']['category'], $rows[2]['cells']['serial'], $rows[2]['cells']['warehouse']]);
    }

    public function test_only_the_first_sheet_is_loaded(): void
    {
        $file = $this->xlsxWithFormulas([
            self::RENTED => [
                $this->rentedHeader(),
                ['Notebook', 'Lenovo', 'E14', 'placeholder', 'T-1', 'Main'],
                ['Notebook', 'Lenovo', 'E14', 'placeholder', 'T-2', 'Main'],
            ],
            'Lists' => [['SN-FROM-LISTS']],
        ], [
            'D2' => ['Lists!A1', 'SN-FROM-LISTS'],
            'D3' => ['Lists!A1', null],
        ]);

        $rows = $this->reader()->read($file, 'rented')['rows'];

        $this->assertSame('SN-FROM-LISTS', $rows[0]['cells']['serial']);
        $this->assertSame('', $rows[1]['cells']['serial']);
    }

    public function test_a_sheet_without_its_header_row_is_refused_by_name(): void
    {
        $file = $this->xlsxUpload([self::RENTED => [
            ['Notebook', 'Lenovo', 'E14', 'SN-1', 'T-1', 'Main'],
        ]]);

        $this->assertSame('import_header_missing', $this->refusalOf($file, 'rented')['message']);
    }

    public function test_a_file_that_is_not_an_xlsx_is_refused_as_unreadable(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        file_put_contents($path, 'not a spreadsheet');
        $file = new UploadedFile($path, 'assets.xlsx', null, null, true);

        $this->assertSame('import_unreadable', $this->refusalOf($file, 'rented')['message']);
    }

    public function test_a_purchased_file_in_the_rented_import_is_refused(): void
    {
        $bySheet = $this->xlsxUpload([self::PURCHASED => [$this->rentedHeader(), ['Notebook', 'Lenovo', 'E14', 'SN-1', 'T-1', 'Main']]]);
        $byColumn = $this->xlsxUpload([self::RENTED => [
            [...$this->rentedHeader(), 'ราคาซื้อ (Price)'],
            ['Notebook', 'Lenovo', 'E14', 'SN-1', 'T-1', 'Main', '100'],
        ]]);

        foreach ([$bySheet, $byColumn] as $file) {
            $refusal = $this->refusalOf($file, 'rented');
            $this->assertSame('import_wrong_template', $refusal['message']);
            $this->assertSame('purchased', $refusal['kind']);
        }
    }

    public function test_missing_required_columns_are_named(): void
    {
        $file = $this->xlsxUpload([self::RENTED => [
            ['ประเภท (Type)', 'ยี่ห้อ (Brand)', 'Serial (Serial No.)', 'คลัง (Warehouse)'],
            ['Notebook', 'Lenovo', 'SN-1', 'Main'],
        ]]);

        $refusal = $this->refusalOf($file, 'rented');

        $this->assertSame('import_missing_columns', $refusal['message']);
        $this->assertSame('รุ่น (Model)', $refusal['columns']);
    }

    public function test_more_than_500_rows_is_refused_and_unknown_columns_are_reported(): void
    {
        $rows = [[...$this->rentedHeader(), 'สี']];
        for ($i = 1; $i <= 501; $i++) {
            $rows[] = ['Notebook', 'Lenovo', 'E14', "SN-{$i}", '', 'Main', 'ดำ'];
        }
        $refusal = $this->refusalOf($this->xlsxUpload([self::RENTED => $rows]), 'rented');
        $this->assertSame('import_too_many_rows', $refusal['message']);
        $this->assertSame(501, $refusal['count']);
        $this->assertSame(500, $refusal['max']);

        $small = $this->xlsxUpload([self::RENTED => [$rows[0], $rows[1]]]);
        $this->assertSame(['สี'], $this->reader()->read($small, 'rented')['ignored']);
    }

    public function test_non_breaking_spaces_are_trimmed_and_nbsp_only_rows_are_skipped(): void
    {
        $nbsp = "\u{A0}";
        $file = $this->xlsxUpload([self::RENTED => [
            $this->rentedHeader(),
            ['Notebook', 'Lenovo', 'E14', "PF4XK101{$nbsp}", '', 'Main'],
            [$nbsp, $nbsp, $nbsp, $nbsp, $nbsp, $nbsp],
        ]]);

        $rows = $this->reader()->read($file, 'rented')['rows'];

        $this->assertSame([2], array_column($rows, 'line'));
        $this->assertSame('PF4XK101', $rows[0]['cells']['serial']);
    }

    public function test_an_empty_template_is_refused(): void
    {
        $file = $this->xlsxUpload([self::RENTED => [$this->rentedHeader()]]);

        $this->assertSame('import_empty', $this->refusalOf($file, 'rented')['message']);
    }
}
