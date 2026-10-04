<?php

namespace Tests\Feature\Report;

use App\Jobs\GenerateReportExport;
use App\Models\Asset\Asset;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportExport;
use App\Models\User;
use App\Services\Report\ReportExportService;
use App\Services\Report\Tabular\TabularReportExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Report exports through the queue (Phase 5b): POST …/export records the request and
 * GenerateReportExport builds the file, which then waits in "ไฟล์ส่งออกของฉัน"
 * (/api/reports/exports) for 7 days — its owner's alone.
 */
class ReportExportQueueTest extends TestCase
{
    use RefreshDatabase;

    private const OVERVIEW = '/api/reports/r/assets.overview/export?format=pdf';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Storage::fake('local');
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<array<string, mixed>> the report_export bells this user has */
    private function bells(User $user): array
    {
        return DatabaseNotification::query()
            ->where('notifiable_id', $user->id)
            ->get()
            ->map(fn (DatabaseNotification $n) => $n->data)
            ->filter(fn (array $data) => $data['type'] === 'report_export')
            ->values()
            ->all();
    }

    public function test_an_export_is_queued_built_listed_and_downloaded_by_its_owner(): void
    {
        Asset::factory()->create(['status' => 'ready']);
        $user = $this->userWith(['assets.view']);

        $id = $this->actingAs($user)->postJson(self::OVERVIEW)
            ->assertAccepted()
            ->assertJsonPath('data.report_key', 'assets.overview')
            ->json('data.id');

        // The sync queue has already run the job.
        $export = ReportExport::findOrFail($id);
        $this->assertSame(ReportExport::READY, $export->status);
        $this->assertSame('Report_assets-overview_2026-09-25.pdf', $export->file_name);
        $this->assertSame(1, $export->rows_count);
        $this->assertGreaterThan(0, $export->size_bytes);
        $this->assertSame('2026-10-02 10:00:00', $export->expires_at->format('Y-m-d H:i:s'));
        Storage::disk('local')->assertExists($export->file_path);

        $this->actingAs($user)->getJson('/api/reports/exports')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'ready')
            // The row says which file it is: the filters it was built with, the picked columns.
            ->assertJsonPath('data.0.filters', [])
            ->assertJsonPath('data.0.columns_count', null);

        $download = $this->actingAs($user)->get("/api/reports/exports/{$id}/download")->assertOk();
        $this->assertSame('application/pdf', $download->headers->get('Content-Type'));

        $bells = $this->bells($user);
        $this->assertCount(1, $bells);
        $this->assertSame(['ready', $id, 'assets.overview', 'pdf'], [$bells[0]['subtype'], $bells[0]['report_export_id'], $bells[0]['report_key'], $bells[0]['format']]);
    }

    public function test_the_ticket_overview_is_queued_through_its_own_endpoint(): void
    {
        $user = $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware']);

        $id = $this->actingAs($user)
            ->postJson('/api/reports/tickets/overview/export?from=2026-09-01&to=2026-09-30&format=pdf')
            ->assertAccepted()->json('data.id');

        $export = ReportExport::findOrFail($id);
        $this->assertSame([ReportExport::READY, 'tickets.overview'], [$export->status, $export->report_key]);
        $this->assertSame(['from' => '2026-09-01', 'to' => '2026-09-30'], $export->filters);
        $this->assertSame('TicketReport_2026-09-01_2026-09-30_2026-09-25.pdf', $export->file_name);
    }

    public function test_nobody_else_can_see_download_retry_or_remove_an_export(): void
    {
        $owner = $this->userWith(['assets.view']);
        $other = $this->userWith(['assets.view']);
        $id = $this->actingAs($owner)->postJson(self::OVERVIEW)->assertAccepted()->json('data.id');

        $this->actingAs($other)->getJson('/api/reports/exports')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($other)->get("/api/reports/exports/{$id}/download")->assertNotFound();
        $this->actingAs($other)->postJson("/api/reports/exports/{$id}/retry")->assertNotFound();
        $this->actingAs($other)->deleteJson("/api/reports/exports/{$id}")->assertNotFound();

        $this->assertDatabaseHas('report_exports', ['id' => $id]);
    }

    public function test_the_owner_removes_an_export_and_its_file(): void
    {
        $user = $this->userWith(['assets.view']);
        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');
        $path = ReportExport::findOrFail($id)->file_path;

        $this->actingAs($user)->deleteJson("/api/reports/exports/{$id}")->assertOk();

        $this->assertDatabaseMissing('report_exports', ['id' => $id]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_a_file_still_waiting_in_the_queue_cannot_be_downloaded(): void
    {
        Queue::fake();
        $user = $this->userWith(['assets.view']);

        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->assertAccepted()->assertJsonPath('data.status', 'queued')->json('data.id');

        Queue::assertPushed(GenerateReportExport::class, fn (GenerateReportExport $job) => $job->exportId === $id);
        $this->actingAs($user)->get("/api/reports/exports/{$id}/download")->assertNotFound();
    }

    public function test_access_lost_before_the_build_fails_the_export_and_says_so(): void
    {
        Queue::fake();
        $user = $this->userWith(['assets.view']);
        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->assertAccepted()->json('data.id');

        RolePermission::query()->where('permission', 'assets.view')->update(['allowed' => false]);
        (new GenerateReportExport($id))->handle(app(ReportExportService::class));

        $export = ReportExport::findOrFail($id);
        $this->assertSame([ReportExport::FAILED, 'forbidden'], [$export->status, $export->error]);
        $this->assertNull($export->file_path);
        $this->assertSame('failed', $this->bells($user)[0]['subtype']);
    }

    public function test_a_build_error_fails_the_export_and_a_retry_builds_it_again(): void
    {
        $user = $this->userWith(['assets.view']);
        $this->mock(TabularReportExporter::class)->shouldReceive('store')->once()->andThrow(new \RuntimeException('disk full'));

        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->assertAccepted()->json('data.id');
        $this->assertSame([ReportExport::FAILED, 'build_failed'], [ReportExport::findOrFail($id)->status, ReportExport::findOrFail($id)->error]);

        $this->forgetMock(TabularReportExporter::class);
        $this->app->forgetInstance(ReportExportService::class);

        $this->actingAs($user)->postJson("/api/reports/exports/{$id}/retry")->assertAccepted();

        $export = ReportExport::findOrFail($id);
        $this->assertSame(ReportExport::READY, $export->status);
        $this->assertNull($export->error);
        $this->assertSame(['failed', 'ready'], array_column($this->bells($user), 'subtype'));
    }

    public function test_only_a_failed_export_can_be_retried(): void
    {
        $user = $this->userWith(['assets.view']);
        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');

        $this->actingAs($user)->postJson("/api/reports/exports/{$id}/retry")
            ->assertUnprocessable()->assertJsonPath('message', 'export_not_failed');
    }

    public function test_one_person_may_only_have_so_many_files_waiting(): void
    {
        Queue::fake();
        $user = $this->userWith(['assets.view']);

        for ($i = 0; $i < ReportExportService::MAX_IN_FLIGHT; $i++) {
            $this->actingAs($user)->postJson(self::OVERVIEW)->assertAccepted();
        }

        $this->actingAs($user)->postJson(self::OVERVIEW)
            ->assertUnprocessable()
            ->assertJsonPath('message', 'export_queue_full')
            ->assertJsonPath('limit', ReportExportService::MAX_IN_FLIGHT);
        // Somebody else's queue is their own.
        $this->actingAs($this->userWith(['assets.view']))->postJson(self::OVERVIEW)->assertAccepted();
    }

    public function test_the_nightly_prune_removes_expired_and_stalled_exports_only(): void
    {
        $user = $this->userWith(['assets.view']);
        $expired = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');
        $expiredPath = ReportExport::findOrFail($expired)->file_path;

        $this->travelTo('2026-10-01 10:00:00');
        $current = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');
        Queue::fake();
        $stalled = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');

        $this->travelTo('2026-10-02 10:30:00');
        $waiting = $this->actingAs($user)->postJson(self::OVERVIEW)->json('data.id');

        // Before the prune, an expired file is no longer offered or served.
        $listed = collect($this->actingAs($user)->getJson('/api/reports/exports')->json('data'))->pluck('id')->all();
        $this->assertNotContains($expired, $listed);
        $this->actingAs($user)->get("/api/reports/exports/{$expired}/download")->assertNotFound();

        $this->artisan('reports:prune-exports')->assertSuccessful();

        $this->assertSame([$current, $waiting], ReportExport::query()->orderBy('id')->pluck('id')->all());
        $this->assertNotContains($stalled, ReportExport::query()->pluck('id')->all());
        Storage::disk('local')->assertMissing($expiredPath);
    }

    public function test_the_old_direct_download_is_gone(): void
    {
        $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/export?format=pdf')
            ->assertMethodNotAllowed();
    }
}
