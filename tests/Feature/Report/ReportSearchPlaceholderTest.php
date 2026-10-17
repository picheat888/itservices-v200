<?php

// Every report search box names what it searches, in both languages.

namespace Tests\Feature\Report;

use App\Services\Report\Access\AccessOverviewReport;
use App\Services\Report\Access\AccessResourceMembersReport;
use App\Services\Report\Access\SoftwareLicenseReport;
use App\Services\Report\Asset\AssetOverviewReport;
use App\Services\Report\Asset\AssetTransferHistoryReport;
use App\Services\Report\Employee\EmployeeOpenItemsReport;
use App\Services\Report\Request\ItPendingRequestReport;
use App\Services\Report\Request\RequestOverviewReport;
use App\Services\Report\Stock\StockBelowMinReport;
use App\Services\Report\Stock\StockMovementReport;
use App\Services\Report\Stock\StockValuationReport;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Ticket\TicketBacklogReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportSearchPlaceholderTest extends TestCase
{
    use RefreshDatabase;

    private const REPORTS = [
        TicketBacklogReport::class => 'rep_ph_ticket_backlog',
        ItPendingRequestReport::class => 'rep_ph_it_pending',
        EmployeeOpenItemsReport::class => 'rep_ph_open_items',
        AssetTransferHistoryReport::class => 'rep_ph_transfer_history',
        AccessResourceMembersReport::class => 'rep_ph_resource_members',
        SoftwareLicenseReport::class => 'rep_ph_software_licenses',
        StockMovementReport::class => 'rep_ph_stock_movements',
        StockValuationReport::class => 'rep_ph_stock_items',
        StockBelowMinReport::class => 'rep_ph_stock_items',
        AccessOverviewReport::class => 'rep_ph_access_overview',
        RequestOverviewReport::class => 'rep_ph_requests_overview',
        AssetOverviewReport::class => 'rep_ph_assets_overview',
    ];

    public function test_each_report_search_box_has_its_own_wording(): void
    {
        foreach (self::REPORTS as $class => $key) {
            $search = collect(app($class)->filters())->first(fn (ReportFilter $f) => $f->type === 'search');

            $this->assertNotNull($search, "{$class} has no search box");
            $this->assertSame($key, $search->toArray()['placeholder_key'], $class);
        }
    }

    public function test_the_wording_exists_in_thai_and_english(): void
    {
        foreach (['th', 'en'] as $locale) {
            $dict = file_get_contents(resource_path("js/lang/{$locale}/report.ts"));
            foreach (array_unique(self::REPORTS) as $key) {
                $this->assertMatchesRegularExpression("/^    {$key}: '[^']+…',$/m", $dict, "{$key} missing in {$locale}");
            }
        }
    }
}
