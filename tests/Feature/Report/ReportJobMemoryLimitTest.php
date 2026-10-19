<?php

// The report jobs raise PHP's memory ceiling before building a file, so a 1,000-row PDF does not die at the 512 MB default.

namespace Tests\Feature\Report;

use App\Jobs\GenerateReportExport;
use App\Jobs\SendScheduledReport;
use App\Services\Report\ReportExportService;
use App\Services\Report\ReportScheduleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportJobMemoryLimitTest extends TestCase
{
    use RefreshDatabase;

    private string $originalLimit;

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalLimit = (string) ini_get('memory_limit');
        ini_set('memory_limit', '512M');
    }

    protected function tearDown(): void
    {
        ini_set('memory_limit', $this->originalLimit);
        parent::tearDown();
    }

    public function test_export_job_raises_the_memory_limit_to_4096m(): void
    {
        (new GenerateReportExport(999999))->handle(app(ReportExportService::class));

        $this->assertSame('4096M', ini_get('memory_limit'));
    }

    public function test_scheduled_report_job_raises_the_memory_limit_to_4096m(): void
    {
        (new SendScheduledReport(999999, now()->toIso8601String()))->handle(app(ReportScheduleService::class));

        $this->assertSame('4096M', ini_get('memory_limit'));
    }

    public function test_export_job_leaves_a_missing_export_alone(): void
    {
        (new GenerateReportExport(999999))->handle(app(ReportExportService::class));

        $this->assertDatabaseCount('report_exports', 0);
    }
}
