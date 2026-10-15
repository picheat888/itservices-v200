<?php

namespace Tests\Feature\Report;

use App\Exports\SafeValueBinder;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Excel as ExcelFormat;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

/**
 * Excel exports write text that could run as a formula (= + - @ tab CR first) as plain text,
 * while numbers, dates and empty cells bind as before.
 */
class ExcelSafeValueBinderTest extends TestCase
{
    public function test_every_export_uses_the_safe_binder(): void
    {
        $this->assertSame(SafeValueBinder::class, config('excel.value_binder.default'));
        $this->assertNotNull(config('excel.exports.chunk_size'), 'the package defaults still merge in');
    }

    public function test_formula_like_text_is_bound_as_a_string_unchanged(): void
    {
        $sheet = (new Spreadsheet)->getActiveSheet();
        $binder = new SafeValueBinder;

        foreach (['=HYPERLINK("x")', '+cmd|calc', '@SUM(A1)', '-cmd', '-', "\tx"] as $i => $value) {
            $cell = $sheet->getCell('A'.($i + 1));
            $this->assertTrue($binder->bindValue($cell, $value));
            $this->assertSame(DataType::TYPE_STRING, $cell->getDataType(), $value);
            $this->assertSame($value, $cell->getValue());
        }

        // A leading carriage return stays text (PhpSpreadsheet stores it as a line break)
        $binder->bindValue($cr = $sheet->getCell('B1'), "\rx");
        $this->assertSame(DataType::TYPE_STRING, $cr->getDataType());

        // Numeric strings are numbers, not formulas
        $binder->bindValue($minus = $sheet->getCell('B2'), '-5');
        $binder->bindValue($plus = $sheet->getCell('B3'), '+1.5');
        $this->assertSame(DataType::TYPE_NUMERIC, $minus->getDataType());
        $this->assertSame(DataType::TYPE_NUMERIC, $plus->getDataType());
    }

    public function test_numbers_text_and_nulls_bind_as_before(): void
    {
        $sheet = (new Spreadsheet)->getActiveSheet();
        $binder = new SafeValueBinder;

        $binder->bindValue($int = $sheet->getCell('A1'), -5);
        $binder->bindValue($float = $sheet->getCell('A2'), -2.5);
        $binder->bindValue($text = $sheet->getCell('A3'), 'Somchai');
        $binder->bindValue($null = $sheet->getCell('A4'), null);

        $this->assertSame(DataType::TYPE_NUMERIC, $int->getDataType());
        $this->assertSame(-5, $int->getValue());
        $this->assertSame(DataType::TYPE_NUMERIC, $float->getDataType());
        $this->assertSame(-2.5, $float->getValue());
        $this->assertSame(DataType::TYPE_STRING, $text->getDataType());
        $this->assertSame(DataType::TYPE_NULL, $null->getDataType());
    }

    public function test_a_written_file_keeps_the_formula_as_text(): void
    {
        $export = new class implements FromArray
        {
            public function array(): array
            {
                return [['=HYPERLINK("http://x","click")', -5, 'plain']];
            }
        };
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        file_put_contents($path, Excel::raw($export, ExcelFormat::XLSX));

        try {
            $sheet = IOFactory::load($path)->getActiveSheet();
            $this->assertSame(DataType::TYPE_STRING, $sheet->getCell('A1')->getDataType());
            $this->assertSame('=HYPERLINK("http://x","click")', $sheet->getCell('A1')->getValue());
            $this->assertSame(DataType::TYPE_NUMERIC, $sheet->getCell('B1')->getDataType());
            $this->assertEquals(-5, $sheet->getCell('B1')->getValue());
        } finally {
            @unlink($path);
        }
    }
}
