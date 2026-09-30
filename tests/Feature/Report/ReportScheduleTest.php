<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Jobs\SendScheduledReport;
use App\Mail\TemplatedMail;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportExport;
use App\Models\Report\ReportSchedule;
use App\Models\User;
use App\Services\Report\ReportScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * Scheduled report emails (Report Center Phase 6): set from a report page, sent by
 * reports:send-scheduled → SendScheduledReport for the period that just closed, to any
 * addresses, as an attachment in the `report.scheduled` template — and managed on the hub.
 */
class ReportScheduleTest extends TestCase
{
    use RefreshDatabase;

    private const REGISTER = '/api/reports/r/assets.register/schedule';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Storage::fake('local');
        Mail::fake();
        // A Wednesday.
        $this->travelTo('2026-09-30 10:00:00');
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

    /** @param array<string, mixed> $overrides */
    private function schedule(User $owner, array $overrides = []): ReportSchedule
    {
        return ReportSchedule::create(array_merge([
            'user_id' => $owner->id,
            'report_key' => 'assets.register',
            'format' => 'pdf',
            'filters' => [],
            'frequency' => ReportSchedule::WEEKLY,
            'send_hour' => 7,
            'recipients' => ['boss@example.com'],
            'active' => true,
            'next_run_at' => '2026-10-05 07:00:00',
        ], $overrides));
    }

    /** @return list<array<string, mixed>> */
    private function bells(User $user, string $type): array
    {
        return DatabaseNotification::query()->where('notifiable_id', $user->id)->get()
            ->map(fn (DatabaseNotification $n) => $n->data)
            ->filter(fn (array $data) => $data['type'] === $type)->values()->all();
    }

    // ── timing ──────────────────────────────────────────────────────────────────────

    public function test_each_frequency_finds_its_next_slot_and_the_period_that_closed_before_it(): void
    {
        $now = CarbonImmutable::parse('2026-09-30 10:00:00');
        $daily = new ReportSchedule(['frequency' => 'daily', 'send_hour' => 7]);
        $weekly = new ReportSchedule(['frequency' => 'weekly', 'send_hour' => 7]);
        $monthly = new ReportSchedule(['frequency' => 'monthly', 'send_hour' => 7]);

        // 07:00 today has passed, so tomorrow; the next Monday; the next 1st.
        $this->assertSame('2026-10-01 07:00', $daily->nextRunAfter($now)->format('Y-m-d H:i'));
        $this->assertSame('2026-10-05 07:00', $weekly->nextRunAfter($now)->format('Y-m-d H:i'));
        $this->assertSame('2026-10-01 07:00', $monthly->nextRunAfter($now)->format('Y-m-d H:i'));
        $this->assertSame('2026-09-30 11:00', (new ReportSchedule(['frequency' => 'daily', 'send_hour' => 11]))->nextRunAfter($now)->format('Y-m-d H:i'));

        $span = fn (array $p) => $p['from']->format('Y-m-d H:i').' / '.$p['to']->format('Y-m-d H:i');
        $this->assertSame('2026-09-30 00:00 / 2026-09-30 23:59', $span($daily->periodFor(CarbonImmutable::parse('2026-10-01 07:00'))));
        $this->assertSame('2026-09-28 00:00 / 2026-10-04 23:59', $span($weekly->periodFor(CarbonImmutable::parse('2026-10-05 07:00'))));
        $this->assertSame('2026-09-01 00:00 / 2026-09-30 23:59', $span($monthly->periodFor(CarbonImmutable::parse('2026-10-01 07:00'))));
    }

    public function test_a_run_replaces_the_date_filters_with_its_period_and_keeps_the_rest(): void
    {
        $owner = $this->userWith(['assets.view']);
        $schedule = $this->schedule($owner, [
            'report_key' => 'assets.transfer_history',
            'filters' => ['from' => '2026-01-01', 'to' => '2026-01-31', 'kind' => 'handover'],
        ]);

        $filters = app(ReportScheduleService::class)->filtersFor($schedule, $schedule->periodFor(CarbonImmutable::parse('2026-10-05 07:00')));

        $this->assertSame(['from' => '2026-09-28', 'to' => '2026-10-04', 'kind' => 'handover'], $filters);
    }

    // ── setting one up ──────────────────────────────────────────────────────────────

    public function test_a_schedule_is_set_from_a_report_page_with_its_filters(): void
    {
        $owner = $this->userWith(['assets.view']);

        $this->actingAs($owner)->postJson(self::REGISTER, [
            'format' => 'xlsx',
            'status' => 'ready',
            'columns' => ['asset_code', 'status'],
            'frequency' => 'weekly',
            'send_hour' => 8,
            'recipients' => ['Boss@Example.com', 'outside.auditor@partner.co.th'],
        ])->assertCreated()
            ->assertJsonPath('data.next_run_at', '2026-10-05T08:00:00+07:00')
            ->assertJsonPath('data.recipients', ['boss@example.com', 'outside.auditor@partner.co.th']);

        $schedule = ReportSchedule::sole();
        $this->assertSame(['status' => 'ready'], $schedule->filters);
        $this->assertSame(['asset_code', 'status'], $schedule->columns);
        $this->assertSame([$owner->id, 'assets.register', 'xlsx'], [$schedule->user_id, $schedule->report_key, $schedule->format]);
    }

    public function test_the_ticket_overview_is_scheduled_through_its_own_endpoint(): void
    {
        $owner = $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware']);

        $this->actingAs($owner)->postJson('/api/reports/tickets/overview/schedule', [
            'from' => '2026-09-01', 'to' => '2026-09-30', 'format' => 'pdf',
            'frequency' => 'monthly', 'send_hour' => 7, 'recipients' => ['boss@example.com'],
        ])->assertCreated()->assertJsonPath('data.report_key', 'tickets.overview');
    }

    public function test_a_schedule_needs_a_valid_timing_and_real_addresses(): void
    {
        $owner = $this->userWith(['assets.view']);
        $tooMany = array_map(fn ($i) => "p{$i}@example.com", range(1, ReportSchedule::MAX_RECIPIENTS + 1));

        $this->actingAs($owner)->postJson(self::REGISTER, [
            'format' => 'docx', 'frequency' => 'hourly', 'send_hour' => 24, 'recipients' => ['not-an-address'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['format', 'frequency', 'send_hour', 'recipients.0']);

        $this->actingAs($owner)->postJson(self::REGISTER, [
            'format' => 'pdf', 'frequency' => 'daily', 'send_hour' => 7, 'recipients' => $tooMany,
        ])->assertUnprocessable()->assertJsonValidationErrors(['recipients']);

        $this->actingAs($owner)->postJson(self::REGISTER, [
            'format' => 'pdf', 'frequency' => 'daily', 'send_hour' => 7, 'recipients' => ['a@example.com', 'A@example.com'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['recipients.1']);
    }

    public function test_only_someone_who_can_open_the_report_may_schedule_it(): void
    {
        $this->actingAs($this->userWith(['tickets.view_all']))->postJson(self::REGISTER, [
            'format' => 'pdf', 'frequency' => 'daily', 'send_hour' => 7, 'recipients' => ['a@example.com'],
        ])->assertForbidden();
    }

    public function test_one_person_may_keep_so_many_schedules(): void
    {
        $owner = $this->userWith(['assets.view']);
        for ($i = 0; $i < ReportSchedule::MAX_PER_USER; $i++) {
            $this->schedule($owner);
        }

        $this->actingAs($owner)->postJson(self::REGISTER, [
            'format' => 'pdf', 'frequency' => 'daily', 'send_hour' => 7, 'recipients' => ['a@example.com'],
        ])->assertUnprocessable()->assertJsonPath('message', 'schedule_limit')->assertJsonPath('limit', ReportSchedule::MAX_PER_USER);
    }

    // ── sending ─────────────────────────────────────────────────────────────────────

    public function test_the_sweep_sends_a_due_schedule_to_every_recipient_with_the_file_attached(): void
    {
        Asset::factory()->create(['status' => 'ready']);
        $owner = $this->userWith(['assets.view']);
        $due = $this->schedule($owner, ['recipients' => ['boss@example.com', 'auditor@partner.co.th'], 'next_run_at' => '2026-09-30 07:00:00']);
        $later = $this->schedule($owner, ['next_run_at' => '2026-10-05 07:00:00']);

        $this->artisan('reports:send-scheduled')->assertSuccessful();

        foreach (['boss@example.com', 'auditor@partner.co.th'] as $address) {
            Mail::assertSent(TemplatedMail::class, fn (TemplatedMail $mail) => $mail->hasTo($address)
                && $mail->attachmentName === 'Report_assets-register_2026-09-30.pdf'
                && str_contains($mail->subjectLine, 'ทะเบียนทรัพย์สิน')
                && str_contains($mail->bodyHtml, 'The report file is attached.'));
        }
        Mail::assertSentCount(2);

        $due->refresh();
        $this->assertSame([ReportSchedule::SENT, null], [$due->last_status, $due->last_error]);
        $this->assertSame('2026-10-05 07:00', $due->next_run_at->format('Y-m-d H:i'));
        $this->assertSame('2026-10-05 07:00', $later->refresh()->next_run_at->format('Y-m-d H:i'));
        $this->assertNull($later->last_run_at);
        $this->assertSame(2, EmailLog::query()->where('template_key', 'report.scheduled')->where('status', 'sent')->count());
        // The built file does not linger on the disk.
        $this->assertSame([], Storage::disk('local')->allFiles('report-schedules'));
    }

    public function test_the_workbook_covers_only_the_period_that_closed(): void
    {
        Excel::fake();
        $owner = $this->userWith(['assets.view']);
        $inside = AssetTransfer::create([
            'asset_id' => Asset::factory()->create()->id, 'asset_tag' => 'INK-1', 'asset_model' => 'X', 'kind' => 'handover',
            'from_owner' => 'Store', 'to_owner' => 'EMP-1', 'reason' => 'r', 'performed_by' => 'IT',
        ]);
        AssetTransfer::query()->whereKey($inside->id)->update(['created_at' => '2026-09-24 09:00:00']);
        $outside = $inside->replicate();
        $outside->save();
        AssetTransfer::query()->whereKey($outside->id)->update(['created_at' => '2026-09-29 09:00:00']);
        $schedule = $this->schedule($owner, ['report_key' => 'assets.transfer_history', 'format' => 'xlsx', 'filters' => ['from' => '2026-01-01', 'to' => '2026-12-31']]);

        (new SendScheduledReport($schedule->id, '2026-09-28T07:00:00+07:00'))->handle(app(ReportScheduleService::class));

        Excel::assertStored("report-schedules/{$schedule->id}/20260928070000/Report_assets-transfer_history_2026-09-30.xlsx", 'local',
            fn (TabularReportExport $export) => $export->rows->pluck('id')->all() === [$inside->id]);
    }

    public function test_an_owner_who_lost_access_pauses_the_schedule_and_hears_about_it(): void
    {
        $owner = $this->userWith(['assets.view']);
        $schedule = $this->schedule($owner, ['next_run_at' => '2026-09-30 07:00:00']);
        RolePermission::query()->update(['allowed' => false]);

        $this->artisan('reports:send-scheduled')->assertSuccessful();

        Mail::assertNothingSent();
        $schedule->refresh();
        $this->assertFalse($schedule->active);
        $this->assertSame([ReportSchedule::FAILED, 'forbidden'], [$schedule->last_status, $schedule->last_error]);
        $this->assertSame('forbidden', $this->bells($owner, 'report_schedule')[0]['error']);
    }

    public function test_nothing_is_sent_while_the_email_template_is_switched_off(): void
    {
        $owner = $this->userWith(['assets.view']);
        EmailTemplate::query()->where('key', 'report.scheduled')->update(['enabled' => false]);
        $schedule = $this->schedule($owner, ['next_run_at' => '2026-09-30 07:00:00']);

        $this->artisan('reports:send-scheduled')->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertSame([ReportSchedule::FAILED, 'template_disabled'], [$schedule->refresh()->last_status, $schedule->last_error]);
    }

    public function test_a_file_too_large_to_attach_goes_to_the_owners_exports_instead(): void
    {
        Asset::factory()->create(['status' => 'ready']);
        $owner = $this->userWith(['assets.view']);
        $schedule = $this->schedule($owner);
        $service = app(ReportScheduleService::class);
        $service->attachmentLimitBytes = 1;
        $this->app->instance(ReportScheduleService::class, $service);

        (new SendScheduledReport($schedule->id, '2026-09-30T07:00:00+07:00'))->handle($service);

        Mail::assertSent(TemplatedMail::class, fn (TemplatedMail $mail) => $mail->attachmentPath === null
            && str_contains($mail->bodyHtml, 'too large to attach'));
        $export = ReportExport::sole();
        $this->assertSame([$owner->id, ReportExport::READY], [$export->user_id, $export->status]);
        Storage::disk('local')->assertExists($export->file_path);
        $this->assertSame('ready', $this->bells($owner, 'report_export')[0]['subtype']);
        $this->assertSame(ReportSchedule::SENT, $schedule->refresh()->last_status);
    }

    // ── managing ────────────────────────────────────────────────────────────────────

    public function test_the_owner_lists_edits_pauses_and_resumes_their_schedules(): void
    {
        $owner = $this->userWith(['assets.view']);
        $schedule = $this->schedule($owner);
        $this->schedule($this->userWith(['assets.view']));

        $this->actingAs($owner)->getJson('/api/reports/schedules')->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs($owner)->putJson("/api/reports/schedules/{$schedule->id}", ['frequency' => 'daily', 'send_hour' => 18, 'recipients' => ['new@example.com']])
            ->assertOk()->assertJsonPath('data.next_run_at', '2026-09-30T18:00:00+07:00')->assertJsonPath('data.recipients', ['new@example.com']);

        $this->actingAs($owner)->putJson("/api/reports/schedules/{$schedule->id}", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->travelTo('2026-10-02 19:00:00');
        $this->actingAs($owner)->putJson("/api/reports/schedules/{$schedule->id}", ['active' => true])
            ->assertOk()->assertJsonPath('data.next_run_at', '2026-10-03T18:00:00+07:00');
    }

    public function test_nobody_else_can_touch_a_schedule(): void
    {
        $schedule = $this->schedule($this->userWith(['assets.view']));
        $other = $this->userWith(['assets.view']);

        $this->actingAs($other)->putJson("/api/reports/schedules/{$schedule->id}", ['active' => false])->assertNotFound();
        $this->actingAs($other)->deleteJson("/api/reports/schedules/{$schedule->id}")->assertNotFound();
        $this->actingAs($other)->postJson("/api/reports/schedules/{$schedule->id}/send-now")->assertNotFound();
        $this->assertTrue($schedule->refresh()->active);
    }

    public function test_send_now_queues_a_run_without_moving_the_regular_slot_and_delete_removes_it(): void
    {
        Queue::fake();
        $owner = $this->userWith(['assets.view']);
        $schedule = $this->schedule($owner);

        $this->actingAs($owner)->postJson("/api/reports/schedules/{$schedule->id}/send-now")->assertAccepted();

        Queue::assertPushed(SendScheduledReport::class, fn (SendScheduledReport $job) => $job->scheduleId === $schedule->id);
        $this->assertSame('2026-10-05 07:00', $schedule->refresh()->next_run_at->format('Y-m-d H:i'));

        $this->actingAs($owner)->deleteJson("/api/reports/schedules/{$schedule->id}")->assertOk();
        $this->assertDatabaseMissing('report_schedules', ['id' => $schedule->id]);
    }
}
