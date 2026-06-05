<?php

namespace Tests\Unit;

use App\Support\DocumentName;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

class DocumentNameTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_builds_a_standard_sortable_filename(): void
    {
        Carbon::setTestNow('2026-06-03 10:00:00');

        $this->assertSame(
            'StockHistory_Receive_SK-UPS-001_2026-06-03.pdf',
            DocumentName::make('StockHistory', ['Receive', 'SK-UPS-001'])
        );
    }

    public function test_collapses_spaces_and_drops_empty_parts(): void
    {
        Carbon::setTestNow('2026-06-03 10:00:00');

        $this->assertSame(
            'Report_Multi-Word_2026-06-03.pdf',
            DocumentName::make('Report', ['Multi Word', '', null])
        );
    }

    public function test_honours_a_custom_extension(): void
    {
        Carbon::setTestNow('2026-06-03 10:00:00');

        $this->assertSame('Export_2026-06-03.xlsx', DocumentName::make('Export', [], 'xlsx'));
    }
}
