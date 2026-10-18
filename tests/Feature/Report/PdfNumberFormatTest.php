<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularSectionSheet;
use App\Models\User;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Report and stock history PDFs: counts, quantities and money print with thousands separators.
 */
class PdfNumberFormatTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_history_pdf_groups_stock_quantity_and_cost(): void
    {
        $history = [
            'item' => ['sku' => 'SKU-12345', 'name' => 'Cable', 'unit' => 'pcs', 'current_stock' => 1234, 'stock_value' => 1523373.0, 'track_serial' => false],
            'reconciliation' => [
                'lines' => [['type' => 'receive', 'count' => 1, 'qty' => 1500, 'sign' => 1], ['type' => 'issue', 'count' => 1, 'qty' => 266, 'sign' => -1]],
                'computed' => 1234, 'current' => 1234, 'difference' => 0,
            ],
            'balances' => [['warehouse' => 'Main', 'qty' => 1234]],
            'lots' => [['unit_cost' => 1234.5, 'qty_received' => 1500, 'qty_remaining' => 1234, 'received_at' => '2026-10-01T09:00:00', 'doc_no' => 'RC-2026-0001', 'serials' => []]],
            'serials' => [],
            'movements' => [[
                'type' => 'receive', 'doc_no' => 'RC-2026-0001', 'moved_at' => '2026-10-01T09:00:00',
                'from_label' => 'Supplier', 'to_label' => 'Main', 'reference' => 'PO-9', 'unit_cost' => 1234.5,
                'qty' => 1500, 'notes' => null, 'recorded_by' => 'Admin', 'recorded_by_th' => null,
            ]],
        ];
        $company = ['name' => 'Acme', 'legal_name' => '', 'address' => '', 'country' => '', 'tax_id' => '', 'currency' => 'THB', 'app_name' => 'IT Service Desk', 'accent' => '#2563eb', 'logo' => null];
        $base = ['history' => $history, 'company' => $company, 'printedAt' => '2026-10-18', 'dateConfig' => DateDisplay::config()];

        $summary = view('pdf.stock-history', $base + ['view' => 'summary'])->render();
        $this->assertStringContainsString('1,234', $summary);
        $this->assertStringContainsString('SKU-12345', $summary);

        $receive = view('pdf.stock-history', $base + ['view' => 'receive'])->render();
        $this->assertStringContainsString('1,500', $receive);
        $this->assertStringContainsString('1,234.50', $receive);
        $this->assertStringContainsString('RC-2026-0001', $receive);
    }

    public function test_tabular_pdf_groups_number_cells_and_count_tiles(): void
    {
        $report = new class extends TabularReport
        {
            public function key(): string
            {
                return 'test.numbers';
            }

            public function title(): string
            {
                return 'Test';
            }

            public function filters(): array
            {
                return [];
            }

            public function query(User $viewer, array $filters): Builder
            {
                throw new \LogicException('not used');
            }

            public function columns(): array
            {
                return [
                    ReportColumn::text('code', 'Code', fn (Model $m) => $m->getAttribute('code')),
                    ReportColumn::number('qty', 'Qty', fn (Model $m) => $m->getAttribute('qty')),
                    ReportColumn::number('hours', 'Hours', fn (Model $m) => $m->getAttribute('hours'), 1),
                ];
            }
        };
        $row = (new class extends Model {})->forceFill(['code' => 'DOC-20261', 'qty' => 4321, 'hours' => 1234]);

        $html = view('pdf.reports.tabular', [
            'report' => $report,
            'summary' => [ReportSummary::make('total', 'Total', 12345)],
            'sections' => [['title' => 'S', 'headings' => ['A', 'B'], 'rows' => [['CT-2026', 6789]]]],
            'scope' => [], 'rows' => collect([$row]), 'truncated' => false, 'total' => 1,
            'company' => CompanyProfile::get(), 'documentNo' => null, 'printedBy' => 'Admin', 'printedAt' => '2026-10-18',
        ])->render();

        $this->assertStringContainsString('4,321', $html);
        $this->assertStringContainsString('1,234.0', $html);
        $this->assertStringContainsString('12,345', $html);
        $this->assertStringContainsString('6,789', $html);
        $this->assertStringContainsString('DOC-20261', $html);
        $this->assertStringContainsString('CT-2026', $html);
    }

    public function test_tabular_pdf_prints_document_facts_tile_context_and_sign_off(): void
    {
        $report = new class extends TabularReport
        {
            public function key(): string
            {
                return 'test.context';
            }

            public function title(): string
            {
                return 'Test';
            }

            public function filters(): array
            {
                return [];
            }

            public function query(User $viewer, array $filters): Builder
            {
                throw new \LogicException('not used');
            }

            public function columns(): array
            {
                return [ReportColumn::daysLeft('left', 'เหลือ (วัน)', fn (Model $m) => $m->getAttribute('left'))];
            }
        };
        $summary = [
            ReportSummary::make('total', 'ทั้งหมด', 602)->withSplit([
                ['key' => 'open', 'label_key' => 'rep_k_open', 'tone' => 'soft-blue', 'value' => 179],
                ['key' => 'in_progress', 'label_key' => 'rep_k_in_progress', 'tone' => 'soft-amber', 'value' => 423],
            ]),
            ReportSummary::make('over_sla', 'เกิน SLA', 351, 'soft-red')->withShareOf(602)->withNote(['label_key' => 'rep_bl_note_most_overdue', 'hours' => 465.3]),
            ReportSummary::make('eo_working', 'ทำงานอยู่', 800)->withNote(['label_key' => 'rep_n_eo_from_start', 'trend' => [
                'direction' => 'down', 'label_key' => 'rep_n_eo_from_start', 'values' => ['delta' => 45], 'up_is_good' => true,
            ]]),
        ];
        $row = (new class extends Model {})->forceFill(['left' => now()->subDays(12)]);

        $html = view('pdf.reports.tabular', [
            'report' => $report, 'summary' => $summary,
            'sections' => [
                ['title' => 'S', 'headings' => ['เลขที่', 'เหลือ (วัน)', 'ทัน SLA (%)'], 'rows' => [['CT-1', -922, 81]], 'note' => 'ตามสถานะตอนนี้ ไม่ขึ้นกับช่วงวันที่'],
                ['title' => 'ตามคลัง', 'headings' => ['คลัง'], 'rows' => [], 'empty' => 'แยกตามคลังได้เฉพาะวันนี้'],
                ['title' => 'ค่าเช่า', 'headings' => ['สัญญา', 'ต่อเดือน', 'ต่อปี'], 'rows' => [['CT-2', 4666.67, 392000.0]], 'money' => [1, 2]],
            ],
            'scope' => [['ตัวกรอง', 'ไม่ได้กรอง']], 'rows' => collect([$row]), 'truncated' => false, 'total' => 1,
            'company' => CompanyProfile::get(), 'documentNo' => 'RPT-261018-0042', 'printedBy' => 'Admin', 'printedAt' => '18 ต.ค. 2569 20:34',
        ])->render();

        $this->assertStringContainsString('เลขที่เอกสาร RPT-261018-0042', $html);
        $this->assertStringContainsString('ข้อมูล ณ 18 ต.ค. 2569 20:34', $html);
        $this->assertStringContainsString('รอรับเคส 179, กำลังดำเนินการ 423', $html);
        $this->assertStringContainsString('58%', $html);
        $this->assertStringContainsString('เกินนานสุด 19 วัน', $html);
        $this->assertStringContainsString('−45 จากต้นช่วง', $html);
        $this->assertStringContainsString('เลยมา 922 วัน', $html);
        $this->assertStringContainsString('81%', $html);
        $this->assertStringContainsString('เลยมา 12 วัน', $html);
        $this->assertStringContainsString('1 รายการ', $html);
        $this->assertStringContainsString('ตามสถานะตอนนี้ ไม่ขึ้นกับช่วงวันที่', $html);
        $this->assertStringContainsString('แยกตามคลังได้เฉพาะวันนี้', $html);
        $this->assertStringContainsString('ต่อปี (บาท)', $html);
        $this->assertStringContainsString('392,000.00', $html);
        $this->assertStringContainsString('4,666.67', $html);

        // The Excel sheet of the same section: the same headings, baht cells in a 2-decimal format.
        $sheet = new TabularSectionSheet(['title' => 'ค่าเช่า', 'headings' => ['สัญญา', 'ต่อเดือน', 'ต่อปี'], 'rows' => [['CT-2', 4666.67, 392000.0]], 'money' => [1, 2]]);
        $this->assertSame(['สัญญา', 'ต่อเดือน (บาท)', 'ต่อปี (บาท)'], $sheet->headings());
        $this->assertSame([['CT-2', 4666.67, 392000.0]], $sheet->array());
        $this->assertStringContainsString('คำอธิบายตัวเลขและคอลัมน์', $html);
        $this->assertStringContainsString('หมายเหตุการนับ', $html);
        $this->assertStringContainsString('เวลาทั้งหมดเป็นเวลาประเทศไทย', $html);
        $this->assertStringContainsString('ผู้ตรวจทาน', $html);
        $this->assertStringContainsString('ผู้อนุมัติ', $html);
    }
}
