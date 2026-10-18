<?php

// Report workbooks are ready for Power BI and an outside audit: zeros stay 0, dates are real
// ISO date cells, the data sheet is a filterable table, and the file says who made it and how.

namespace Tests\Feature\Report;

use App\Exports\Report\TabularGlossarySheet;
use App\Exports\Report\TabularSectionSheet;
use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Report\Asset\AssetOverviewReport;
use App\Services\Report\Asset\AssetTransferHistoryReport;
use App\Services\Report\Asset\AssetWriteoffReport;
use App\Services\Report\Request\RequestApprovalsReport;
use App\Services\Report\Stock\StockBelowMinReport;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\TabularReportExporter;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;
use Maatwebsite\Excel\Excel as ExcelWriter;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Tests\TestCase;

class ExcelAnalysisReadyTest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Storage::fake('local');
        $this->travelTo('2026-09-25 10:00:00');
        AppSetting::put('date_format', 'd_mon_y');
        AppSetting::put('date_era', 'be');
        $this->viewer = User::factory()->create(['name' => 'Audit Reader']);
        Asset::factory()->create(['status' => 'ready', 'value' => 0, 'purchase_date' => '2026-08-31']);
    }

    /** @param list<string>|null $columns */
    private function workbook(?array $columns = null): Spreadsheet
    {
        $report = app(AssetOverviewReport::class)->showOnly($columns);
        $file = app(TabularReportExporter::class)->store($report, $this->viewer, $report->resolveFilters([]), 'xlsx', 'audit');

        return IOFactory::load(Storage::disk('local')->path($file['path']));
    }

    /** @return array<string, mixed> heading → cell of the first data row */
    private function firstRow(Worksheet $sheet): array
    {
        $rows = $sheet->toArray(null, false, false);

        return array_combine($rows[0], $rows[1]);
    }

    private function labelValue(Worksheet $sheet, string $label): mixed
    {
        foreach ($sheet->toArray(null, false, false) as $row) {
            if ($row[0] === $label) {
                return $row[1];
            }
        }
        $this->fail("No row [{$label}] on sheet {$sheet->getTitle()}");
    }

    public function test_every_workbook_names_its_data_sheet_raw_data_and_ends_with_the_glossary(): void
    {
        $titles = $this->workbook()->getSheetNames();

        $this->assertSame('สรุป', $titles[0]);
        $this->assertSame(['ข้อมูลดิบ', 'คำอธิบายคอลัมน์'], array_slice($titles, -2));
    }

    public function test_a_zero_stays_zero_in_the_data_and_summary_sheets(): void
    {
        $book = $this->workbook();

        $this->assertSame(0, (int) $this->firstRow($book->getSheetByName('ข้อมูลดิบ'))['มูลค่า']);
        $this->assertNotNull($this->firstRow($book->getSheetByName('ข้อมูลดิบ'))['มูลค่า']);
        $this->assertSame(0, $this->labelValue($book->getSheetByName('สรุป'), 'รอรับคืน'));
    }

    public function test_dates_are_real_excel_dates_shown_as_iso_whatever_the_date_setting(): void
    {
        $sheet = $this->workbook()->getSheetByName('ข้อมูลดิบ');
        $headings = $sheet->toArray(null, false, false)[0];
        $cell = $sheet->getCell([array_search('วันที่ซื้อ', $headings, true) + 1, 2]);

        $this->assertIsFloat($cell->getValue());
        $this->assertSame('yyyy-mm-dd', $cell->getStyle()->getNumberFormat()->getFormatCode());
        $this->assertSame('2026-08-31', $cell->getFormattedValue());
    }

    public function test_the_data_sheet_is_a_filterable_table_with_a_frozen_bold_heading(): void
    {
        $sheet = $this->workbook()->getSheetByName('ข้อมูลดิบ');

        $this->assertSame('A2', $sheet->getFreezePane());
        $this->assertSame('A1:'.$sheet->getHighestDataColumn().'2', $sheet->getAutoFilter()->getRange());
        $this->assertTrue($sheet->getStyle('A1')->getFont()->getBold());
    }

    public function test_the_summary_says_who_exported_from_which_system_and_how_many_rows(): void
    {
        AppSetting::put('brand_name', 'IT Service Desk V2.0');
        $summary = $this->workbook(['asset_code', 'status'])->getSheetByName('สรุป');

        $this->assertSame('Audit Reader', $this->labelValue($summary, 'ส่งออกโดย'));
        $this->assertSame('IT Service Desk V2.0', $this->labelValue($summary, 'ระบบ'));
        $this->assertSame(1, $this->labelValue($summary, 'จำนวนแถวในชีต "ข้อมูลดิบ"'));
        // The column picker's choice is on record
        $this->assertStringContainsString('หมวดหมู่', $this->labelValue($summary, 'คอลัมน์ที่ซ่อนไว้ตอนส่งออก'));
    }

    public function test_the_file_properties_name_the_system_the_report_and_the_exporter(): void
    {
        AppSetting::put('brand_name', 'IT Service Desk V2.0');
        $properties = $this->workbook()->getProperties();

        $this->assertSame('IT Service Desk V2.0', $properties->getCreator());
        $this->assertSame('Audit Reader', $properties->getLastModifiedBy());
        $this->assertSame('ภาพรวมของทรัพย์สิน', $properties->getTitle());
        $this->assertSame('assets.overview', $properties->getSubject());
    }

    public function test_the_glossary_lists_every_data_column_with_its_kind_of_data(): void
    {
        $book = $this->workbook();
        $headings = $book->getSheetByName('ข้อมูลดิบ')->toArray(null, false, false)[0];
        $glossary = collect($book->getSheetByName('คำอธิบายคอลัมน์')->toArray(null, false, false))->slice(1)->keyBy(1);

        $this->assertSame($headings, $glossary->keys()->all());
        $this->assertSame('วันที่ (ปี ค.ศ. yyyy-mm-dd)', $glossary['วันที่ซื้อ'][2]);
        $this->assertSame('จำนวนเงิน (บาท)', $glossary['มูลค่า'][2]);
        $this->assertStringStartsWith('ค่าใดค่าหนึ่งใน: ', $glossary['สถานะ'][2]);
    }

    public function test_codes_sit_beside_names_and_nobody_is_an_empty_cell_not_a_dash(): void
    {
        $department = Department::create(['code' => 'D-IT', 'name' => 'IT', 'name_th' => 'ไอที']);
        $employee = Employee::create(['code' => 'EMP-5', 'first_name' => 'Anan', 'last_name' => 'Tech', 'department_id' => $department->id]);
        Asset::query()->update(['owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $employee->id, 'owner' => null]);

        $rows = collect($this->workbook()->getSheetByName('ข้อมูลดิบ')->toArray(null, false, false));
        $headings = $rows->first();
        $byHolderCode = $rows->slice(1)->map(fn (array $row) => array_combine($headings, $row))->keyBy(fn (array $row) => $row['รหัสพนักงานผู้ถือ'] ?? 'none');

        $this->assertSame(array_search('ผู้ถือ', $headings, true) + 1, array_search('รหัสพนักงานผู้ถือ', $headings, true));
        $this->assertSame(array_search('แผนก', $headings, true) + 1, array_search('รหัสแผนก', $headings, true));
        $this->assertSame('D-IT', $byHolderCode['EMP-5']['รหัสแผนก']);
        $this->assertNull($byHolderCode['none']['ผู้ถือ']);
    }

    public function test_a_display_only_mix_stays_off_the_sheet_and_its_parts_stay_on(): void
    {
        $headings = array_map(fn ($c) => $c->heading, app(StockBelowMinReport::class)->sheetColumns());

        $this->assertNotContains('Min – Max', $headings);
        $this->assertContains('Min', $headings);
        $this->assertContains('Max', $headings);
        $this->assertContains('Min – Max', array_map(fn ($c) => $c->heading, app(StockBelowMinReport::class)->screenColumns()));
    }

    public function test_rows_without_a_number_of_their_own_end_with_the_record_id(): void
    {
        $last = fn ($report) => last($report->sheetColumns())->heading;

        $this->assertSame('เลขที่รายการในระบบ', $last(app(AssetTransferHistoryReport::class)));
        $this->assertSame('เลขที่รายการในระบบ', $last(app(RequestApprovalsReport::class)));
        $this->assertNotSame('เลขที่รายการในระบบ', $last(app(AssetOverviewReport::class)));
    }

    public function test_approver_kinds_read_in_thai_on_the_sheet(): void
    {
        $keys = array_map(fn ($c) => $c->key, app(RequestApprovalsReport::class)->sheetColumns());

        $this->assertContains('approver_kind_th', $keys);
        $this->assertNotContains('approver_kind', $keys);
    }

    /** Money, days-left and hours-left figures are worked out by the system, so the glossary says how. */
    public function test_every_calculated_money_and_time_column_is_explained_in_the_glossary(): void
    {
        foreach (array_keys(ReportCatalogue::definitions()) as $key) {
            $report = ReportCatalogue::tabular($key);
            if ($report === null) {
                continue;
            }
            foreach ($report->sheetColumns() as $column) {
                if (in_array($column->type, ['money', 'days_left', 'hours_left'], true)) {
                    $this->assertNotSame('', $report->columnMeaning($column), "{$key} / {$column->key}");
                }
            }
        }

        $glossary = collect((new TabularGlossarySheet(app(AssetWriteoffReport::class)))->array())->keyBy(1);
        $this->assertStringContainsString('30.44', $glossary['ประกันเหลือ (เดือน)'][3]);
        $this->assertStringNotContainsString('—', $glossary['ประกันตอนตัดจำหน่าย'][2]);
    }

    public function test_a_section_sheet_writes_dates_as_dates_and_keeps_zeros(): void
    {
        $sheet = $this->readSheet(new TabularSectionSheet([
            'title' => 'แยกตามเดือน',
            'headings' => ['เดือน', 'จำนวน', 'วันที่'],
            'rows' => [[CellDate::month('2026-08'), 0, CellDate::date('2026-08-31')]],
        ]));

        $this->assertSame('2026-08', $sheet->getCell('A2')->getFormattedValue());
        $this->assertSame(0, $sheet->getCell('B2')->getValue());
        $this->assertSame('2026-08-31', $sheet->getCell('C2')->getFormattedValue());
        $this->assertSame('A2', $sheet->getFreezePane());
    }

    public function test_the_pdf_still_prints_section_dates_in_the_date_setting(): void
    {
        $this->assertSame('ส.ค. 2569', CellDate::month('2026-08')->display());
        $this->assertSame('31 ส.ค. 2569', CellDate::date('2026-08-31')->display());
        $this->assertNull(CellDate::date(null));
    }

    private function readSheet(object $sheet): Worksheet
    {
        $export = new class($sheet) implements WithMultipleSheets
        {
            public function __construct(private object $sheet) {}

            public function sheets(): array
            {
                return [$this->sheet];
            }
        };

        $path = tempnam(sys_get_temp_dir(), 'xl').'.xlsx';
        file_put_contents($path, Excel::raw($export, ExcelWriter::XLSX));
        $worksheet = IOFactory::load($path)->getSheet(0);
        unlink($path);

        return $worksheet;
    }
}
