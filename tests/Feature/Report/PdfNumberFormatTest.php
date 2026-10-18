<?php

namespace Tests\Feature\Report;

use App\Models\User;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
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
            'company' => 'Acme', 'printedBy' => 'Admin', 'printedAt' => '2026-10-18',
        ])->render();

        $this->assertStringContainsString('4,321', $html);
        $this->assertStringContainsString('1,234.0', $html);
        $this->assertStringContainsString('12,345', $html);
        $this->assertStringContainsString('6,789', $html);
        $this->assertStringContainsString('DOC-20261', $html);
        $this->assertStringContainsString('CT-2026', $html);
    }
}
