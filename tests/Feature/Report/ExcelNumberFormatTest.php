<?php

namespace Tests\Feature\Report;

use App\Enums\Ticket\TicketStatus;
use App\Exports\Report\TabularRowsSheet;
use App\Exports\Report\TabularSummarySheet;
use App\Exports\Report\TicketOverviewSummarySheet;
use App\Models\Ticket\Ticket;
use App\Services\Report\Stock\StockBelowMinReport;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Ticket\TicketBacklogReport;
use App\Services\Report\Ticket\TicketManualSlaReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;
use Maatwebsite\Excel\Excel as ExcelWriter;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Tests\TestCase;

/**
 * Excel report sheets: count and money cells carry a thousands-separator number format and stay numeric.
 */
class ExcelNumberFormatTest extends TestCase
{
    use RefreshDatabase;

    public function test_number_and_money_columns_carry_an_excel_number_format(): void
    {
        $report = app(StockBelowMinReport::class);
        $sheet = new TabularRowsSheet($report, collect());
        $formats = $sheet->columnFormats();

        $types = [];
        foreach ($report->sheetColumns() as $i => $column) {
            $letter = Coordinate::stringFromColumnIndex($i + 1);
            $types[] = $column->type;
            $expected = match ($column->type) {
                'money' => '#,##0.00',
                'number', 'days_left', 'hours_left' => '#,##0',
                'date' => 'yyyy-mm-dd',
                'datetime' => 'yyyy-mm-dd hh:mm',
                default => null,
            };
            $this->assertSame($expected, $formats[$letter] ?? null, $column->key);
        }
        $this->assertContains('money', $types);
        $this->assertContains('number', $types);
    }

    public function test_fractional_hours_columns_keep_one_decimal_in_excel(): void
    {
        $ticket = Ticket::factory()->create([
            'category' => 'hardware',
            'status' => TicketStatus::Completed,
            'created_at' => '2026-09-01 08:00:00',
            'resolved_at' => '2026-09-01 13:30:00',
        ]);
        $report = app(TicketManualSlaReport::class);

        $worksheet = $this->readSheet(new TabularRowsSheet($report, collect([$ticket])));

        $keys = array_map(fn ($column) => $column->key, $report->sheetColumns());
        $cell = Coordinate::stringFromColumnIndex(array_search('fix_hours', $keys, true) + 1).'2';
        $this->assertEquals(5.5, $worksheet->getCell($cell)->getValue());
        $this->assertSame('#,##0.0', $worksheet->getStyle($cell)->getNumberFormat()->getFormatCode());
    }

    public function test_hours_left_keeps_one_decimal_in_excel(): void
    {
        $formats = (new TabularRowsSheet(app(TicketBacklogReport::class), collect()))->columnFormats();
        $keys = array_map(fn ($column) => $column->key, app(TicketBacklogReport::class)->sheetColumns());

        $this->assertSame('#,##0.0', $formats[Coordinate::stringFromColumnIndex(array_search('hours_left', $keys, true) + 1)]);
    }

    public function test_summary_sheet_formats_tile_values_by_kind_and_keeps_them_numeric(): void
    {
        $sheet = new TabularSummarySheet(app(StockBelowMinReport::class), [
            ReportSummary::make('total', 'Total', 12345),
            ReportSummary::make('value', 'Value', 9876.5, null, 'money'),
        ]);

        $worksheet = $this->readSheet($sheet);

        $this->assertSame(12345, $worksheet->getCell('B'.$this->rowOf($worksheet, 'Total'))->getValue());
        $this->assertCellFormat($worksheet, 'Total', '#,##0');
        $this->assertEquals(9876.5, $worksheet->getCell('B'.$this->rowOf($worksheet, 'Value'))->getValue());
        $this->assertCellFormat($worksheet, 'Value', '#,##0.00');
    }

    public function test_ticket_overview_summary_groups_whole_number_cells(): void
    {
        $summary = [
            'range' => ['from' => '2026-10-01', 'to' => '2026-10-17'],
            'generated_at' => '2026-10-18 09:00:00',
            'kpi' => [
                'total' => 12345, 'completed' => 2345, 'canceled' => 1, 'sla_rate' => 93, 'sla_measured' => 10, 'sla_met' => 9,
                'avg_resolve_hours' => 5.5, 'p90_resolve_hours' => 9.0,
            ],
            'backlog' => ['open' => 1000, 'in_progress' => 500, 'over_sla' => 3],
            'sla_by_priority' => [], 'by_category' => [], 'by_department' => [], 'by_assignee' => [],
        ];

        $worksheet = $this->readSheet(new TicketOverviewSummarySheet($summary));

        $this->assertSame(12345, $worksheet->getCell('B'.$this->rowOf($worksheet, 'Ticket ทั้งหมด'))->getValue());
        $this->assertCellFormat($worksheet, 'Ticket ทั้งหมด', '#,##0');
        $this->assertSame(1500, $worksheet->getCell('B'.$this->rowOf($worksheet, 'ค้างอยู่ตอนนี้'))->getValue());
        $this->assertCellFormat($worksheet, 'ค้างอยู่ตอนนี้', '#,##0');
        $this->assertSame('General', $worksheet->getStyle('B'.$this->rowOf($worksheet, 'เวลาปิดเคสเฉลี่ย (ชม.)'))->getNumberFormat()->getFormatCode());
    }

    private function rowOf(Worksheet $worksheet, string $label): int
    {
        foreach ($worksheet->toArray() as $i => $row) {
            if (($row[0] ?? null) === $label) {
                return $i + 1;
            }
        }
        $this->fail("No row labelled {$label}");
    }

    private function assertCellFormat(Worksheet $worksheet, string $label, string $format): void
    {
        $this->assertSame($format, $worksheet->getStyle('B'.$this->rowOf($worksheet, $label))->getNumberFormat()->getFormatCode(), $label);
    }

    /** Writes the sheet to xlsx and reads it back, the way a reader's Excel sees it. */
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
