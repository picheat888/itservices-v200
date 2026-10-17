<?php

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportExport;
use App\Models\Report\ReportSchedule;
use App\Models\User;
use App\Services\Report\ReportExportService;
use App\Services\Report\ReportScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// Exporting and scheduling are their own rights on top of opening the report.
class ReportToolRightsTest extends TestCase
{
    use RefreshDatabase;

    private const SCHEDULE_BODY = ['format' => 'xlsx', 'frequency' => 'weekly', 'send_hour' => 8, 'recipients' => ['boss@example.com']];

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'tool_'.uniqid(), 'name' => 'Report Tools', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function readyExport(User $owner): ReportExport
    {
        Storage::fake('local');
        Storage::disk('local')->put('report-exports/x/assets.xlsx', 'file');

        return ReportExport::create([
            'user_id' => $owner->id, 'report_key' => 'assets.overview', 'format' => 'xlsx', 'filters' => [],
            'status' => ReportExport::READY, 'file_name' => 'assets.xlsx', 'file_path' => 'report-exports/x/assets.xlsx',
            'started_at' => now(), 'finished_at' => now(), 'expires_at' => now()->addDays(ReportExport::KEEP_DAYS),
        ]);
    }

    private function makeSchedule(User $owner): ReportSchedule
    {
        return ReportSchedule::create([
            'user_id' => $owner->id,
            'report_key' => 'assets.overview',
            'format' => 'pdf',
            'filters' => [],
            'frequency' => ReportSchedule::WEEKLY,
            'send_hour' => 7,
            'recipients' => ['boss@example.com'],
            'active' => true,
            'next_run_at' => '2026-10-05 07:00:00',
        ]);
    }

    public function test_exporting_needs_the_export_right(): void
    {
        Queue::fake();
        $reader = $this->userWith(['reports.module', 'reports.assets', 'reports.tickets']);

        $this->actingAs($reader)->postJson('/api/reports/tabular/assets.overview/export', ['format' => 'xlsx'])->assertForbidden();
        $this->actingAs($reader)->postJson('/api/reports/tickets/overview/export?from=2026-09-01&to=2026-09-30', ['format' => 'xlsx'])->assertForbidden();

        $exporter = $this->userWith(['reports.module', 'reports.assets', 'reports.export']);
        $this->actingAs($exporter)->postJson('/api/reports/tabular/assets.overview/export', ['format' => 'xlsx'])->assertStatus(202);
    }

    public function test_export_right_without_a_domain_opens_nothing(): void
    {
        $user = $this->userWith(['reports.module', 'reports.export']);

        $this->actingAs($user)->getJson('/api/reports')->assertOk()->assertExactJson(['data' => []]);
        $this->actingAs($user)->postJson('/api/reports/tabular/assets.overview/export', ['format' => 'xlsx'])->assertForbidden();
        $this->actingAs($user)->getJson('/api/reports/exports')->assertOk();
    }

    public function test_my_exports_need_export_or_schedule_and_deleting_needs_neither(): void
    {
        $reader = $this->userWith(['reports.module', 'reports.assets']);
        $export = $this->readyExport($reader);

        $this->actingAs($reader)->getJson('/api/reports/exports')->assertForbidden();
        $this->actingAs($reader)->get("/api/reports/exports/{$export->id}/download")->assertForbidden();
        $this->actingAs($reader)->postJson("/api/reports/exports/{$export->id}/retry")->assertForbidden();
        $this->actingAs($reader)->deleteJson("/api/reports/exports/{$export->id}")->assertOk();
    }

    public function test_a_schedule_owner_without_export_can_still_download_their_files(): void
    {
        $owner = $this->userWith(['reports.module', 'reports.assets', 'reports.schedule']);
        $export = $this->readyExport($owner);

        $this->actingAs($owner)->getJson('/api/reports/exports')->assertOk();
        $this->actingAs($owner)->get("/api/reports/exports/{$export->id}/download")->assertOk();
        $this->actingAs($owner)->postJson("/api/reports/exports/{$export->id}/retry")->assertForbidden();
    }

    public function test_my_exports_hide_files_of_a_report_the_owner_can_no_longer_open(): void
    {
        $owner = $this->userWith(['reports.module', 'reports.assets', 'reports.export']);
        $export = $this->readyExport($owner);
        RolePermission::where('permission', 'reports.assets')->update(['allowed' => false]);

        $this->actingAs($owner)->getJson('/api/reports/exports')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($owner)->get("/api/reports/exports/{$export->id}/download")->assertNotFound();
        $this->actingAs($owner)->deleteJson("/api/reports/exports/{$export->id}")->assertOk();
    }

    public function test_a_queued_export_fails_when_the_owner_lost_the_export_right(): void
    {
        $owner = $this->userWith(['reports.module', 'reports.assets', 'reports.export']);
        $export = ReportExport::create([
            'user_id' => $owner->id, 'report_key' => 'assets.overview', 'format' => 'xlsx', 'filters' => [], 'status' => ReportExport::QUEUED,
        ]);
        RolePermission::where('permission', 'reports.export')->update(['allowed' => false]);

        app(ReportExportService::class)->build($export->fresh());

        $this->assertSame(ReportExport::FAILED, $export->fresh()->status);
        $this->assertSame('forbidden', $export->fresh()->error);
    }

    public function test_scheduling_needs_the_schedule_right(): void
    {
        $reader = $this->userWith(['reports.module', 'reports.assets', 'reports.tickets', 'reports.export']);

        $this->actingAs($reader)->postJson('/api/reports/tabular/assets.overview/schedule', self::SCHEDULE_BODY)->assertForbidden();
        $this->actingAs($reader)->postJson('/api/reports/tickets/overview/schedule', ['from' => '2026-09-01', 'to' => '2026-09-30', ...self::SCHEDULE_BODY])->assertForbidden();

        $scheduler = $this->userWith(['reports.module', 'reports.assets', 'reports.schedule']);
        $this->actingAs($scheduler)->postJson('/api/reports/tabular/assets.overview/schedule', self::SCHEDULE_BODY)->assertCreated();
    }

    public function test_changing_a_schedule_needs_the_schedule_right_but_the_list_stays_readable(): void
    {
        $owner = $this->userWith(['reports.module', 'reports.assets', 'reports.export']);
        $schedule = $this->makeSchedule($owner);

        $this->actingAs($owner)->getJson('/api/reports/schedules')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($owner)->putJson("/api/reports/schedules/{$schedule->id}", ['active' => false])->assertForbidden();
        $this->actingAs($owner)->postJson("/api/reports/schedules/{$schedule->id}/send-now")->assertForbidden();
        $this->actingAs($owner)->deleteJson("/api/reports/schedules/{$schedule->id}")->assertForbidden();
    }

    public function test_a_due_schedule_is_switched_off_when_the_owner_lost_the_schedule_right(): void
    {
        $owner = $this->userWith(['reports.module', 'reports.assets', 'reports.schedule']);
        $schedule = $this->makeSchedule($owner);
        RolePermission::where('permission', 'reports.schedule')->update(['allowed' => false]);

        app(ReportScheduleService::class)->run($schedule->fresh(), CarbonImmutable::now());

        $this->assertFalse($schedule->fresh()->active);
        $this->assertSame(ReportSchedule::FAILED, $schedule->fresh()->last_status);
        $this->assertSame('forbidden', $schedule->fresh()->last_error);
    }
}
