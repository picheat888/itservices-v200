<?php

// Covers the company-holiday API: list all, replace one year, validation codes, deadline recompute.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\RolePermission;
use App\Models\Settings\SlaHoliday;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketDeadlineService;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Tests\TestCase;

class SlaHolidayApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        $this->travelTo('2026-05-10 09:00:00');
    }

    protected function tearDown(): void
    {
        TicketSla::flush();
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** A high-priority ticket (8h resolution target) with its stored deadlines computed as they are today. */
    private function openTicket(string $createdAt, string $status = 'open'): Ticket
    {
        $ticket = Ticket::factory()->create(['status' => $status, 'priority' => 'high', 'created_at' => $createdAt]);
        $ticket->forceFill([
            'sla_response_due_at' => TicketSla::responseDueAt($ticket),
            'sla_resolve_due_at' => TicketSla::resolveDueAt($ticket),
        ])->saveQuietly();

        return $ticket->refresh();
    }

    /** @param list<array<string, string>> $rows */
    private function save(int $year, array $rows): TestResponse
    {
        return $this->actingAs($this->admin())->putJson("/api/settings/sla-holidays/{$year}", ['holidays' => $rows]);
    }

    public function test_listing_needs_the_sla_settings_right(): void
    {
        SlaHoliday::factory()->create(['date' => '2026-05-01', 'name' => 'Labour Day']);
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)->getJson('/api/settings/sla-holidays')->assertForbidden();

        RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => 'settings.sla'], ['allowed' => true]);

        $this->actingAs($user)->getJson('/api/settings/sla-holidays')
            ->assertOk()
            ->assertJsonPath('data.0.date', '2026-05-01')
            ->assertJsonPath('data.0.name', 'Labour Day');
    }

    public function test_saving_a_year_replaces_only_that_year(): void
    {
        SlaHoliday::factory()->create(['date' => '2026-01-01', 'name' => 'Old']);
        SlaHoliday::factory()->create(['date' => '2026-02-02', 'name' => 'Gone']);
        SlaHoliday::factory()->create(['date' => '2027-01-01', 'name' => 'Next year']);

        $this->save(2026, [
            ['date' => '2026-05-01', 'name' => 'Labour Day'],
            ['date' => '2026-01-01', 'name' => 'New Year'],
        ])->assertOk()->assertJsonPath('message', 'success')->assertJsonCount(3, 'data');

        $this->assertSame(
            ['2026-01-01' => 'New Year', '2026-05-01' => 'Labour Day', '2027-01-01' => 'Next year'],
            SlaHoliday::orderBy('date')->get()->mapWithKeys(fn ($h) => [$h->date->format('Y-m-d') => $h->name])->all(),
        );
    }

    public function test_resaving_a_year_that_holds_31_december_does_not_duplicate_it(): void
    {
        DB::table('sla_holidays')->insert(['date' => '2026-12-31 00:00:00', 'name' => 'New Year Eve', 'created_at' => now(), 'updated_at' => now()]);

        $this->save(2026, [
            ['date' => '2026-12-31', 'name' => 'New Year Eve'],
            ['date' => '2026-05-01', 'name' => 'Labour Day'],
        ])->assertOk()->assertJsonCount(2, 'data');

        $this->assertSame(
            ['2026-05-01', '2026-12-31'],
            SlaHoliday::orderBy('date')->get()->map(fn ($h) => $h->date->format('Y-m-d'))->all(),
        );
    }

    public function test_validation_codes(): void
    {
        $this->save(2026, [
            ['date' => '2026-05-01', 'name' => 'A'],
            ['date' => '2026-05-01', 'name' => 'B'],
        ])->assertJsonValidationErrors(['holidays.1.date' => 'holiday_date_taken']);

        $this->save(2026, [['date' => '2027-01-01', 'name' => 'A']])
            ->assertJsonValidationErrors(['holidays.0.date' => 'holiday_date_other_year']);

        $this->save(2026, [['date' => '2026-05-01', 'name' => '  ']])
            ->assertJsonValidationErrors(['holidays.0.name' => 'holiday_name_required']);

        $this->save(2026, [['name' => 'A']])
            ->assertJsonValidationErrors(['holidays.0.date' => 'holiday_date_required']);

        $many = [];
        for ($i = 0; $i < 61; $i++) {
            $many[] = ['date' => date('Y-m-d', strtotime("2026-01-01 +{$i} days")), 'name' => "H{$i}"];
        }
        $this->save(2026, $many)->assertUnprocessable();

        $this->save(1999, [])->assertNotFound();
        $this->assertSame(0, SlaHoliday::count());
    }

    public function test_open_tickets_move_and_closed_ones_stay(): void
    {
        $open = $this->openTicket('2026-04-30 16:00:00');
        $done = $this->openTicket('2026-04-30 16:00:00', 'completed');
        $this->assertSame('2026-05-01 16:00', $open->sla_resolve_due_at->format('Y-m-d H:i'));
        $doneBefore = $done->sla_resolve_due_at->format('Y-m-d H:i');

        $this->save(2026, [
            ['date' => '2026-05-01', 'name' => 'Labour Day'],
            ['date' => '2026-05-04', 'name' => 'Bridge'],
        ])->assertOk()->assertJsonPath('meta.moved', 1);

        $this->assertSame('2026-05-05 16:00', $open->refresh()->sla_resolve_due_at->format('Y-m-d H:i'));
        $this->assertSame($doneBefore, $done->refresh()->sla_resolve_due_at->format('Y-m-d H:i'));
    }

    public function test_alert_level_resets_only_where_the_deadline_moved(): void
    {
        $spans = $this->openTicket('2026-04-30 16:00:00');
        $apart = $this->openTicket('2026-03-02 09:00:00');
        Ticket::whereIn('id', [$spans->id, $apart->id])->update(['sla_resolve_alert_level' => 'over_sla']);

        $this->save(2026, [['date' => '2026-05-01', 'name' => 'Labour Day']])->assertOk();

        $this->assertNull($spans->refresh()->sla_resolve_alert_level);
        $this->assertSame('over_sla', $apart->refresh()->sla_resolve_alert_level);
    }

    public function test_new_year_rows_move_a_ticket_running_across_new_year(): void
    {
        $ticket = $this->openTicket('2026-12-31 09:00:00');
        $this->assertSame('2027-01-01 09:00', $ticket->sla_resolve_due_at->format('Y-m-d H:i'));

        $this->save(2027, [['date' => '2027-01-01', 'name' => 'New Year']])->assertOk()->assertJsonPath('meta.moved', 1);

        $this->assertSame('2027-01-04 09:00', $ticket->refresh()->sla_resolve_due_at->format('Y-m-d H:i'));
    }

    public function test_a_failed_recompute_rolls_the_holidays_back(): void
    {
        SlaHoliday::factory()->create(['date' => '2026-01-01', 'name' => 'Keep']);
        $this->app->instance(TicketDeadlineService::class, new class extends TicketDeadlineService
        {
            public function recomputeOpen(): int
            {
                throw new RuntimeException('recompute failed');
            }
        });

        $this->save(2026, [['date' => '2026-05-01', 'name' => 'Labour Day']])->assertStatus(500);

        $this->assertSame(['2026-01-01' => 'Keep'], SlaHoliday::all()->mapWithKeys(fn ($h) => [$h->date->format('Y-m-d') => $h->name])->all());
        $this->assertArrayNotHasKey('2026-05-01', TicketSla::holidays());
        $this->assertSame(0, AuditLog::where('action', 'Updated SLA holidays')->count());
    }

    public function test_an_audit_row_names_the_changes(): void
    {
        SlaHoliday::factory()->create(['date' => '2026-01-01', 'name' => 'Old name']);
        SlaHoliday::factory()->create(['date' => '2026-02-02', 'name' => 'Gone']);

        $this->save(2026, [
            ['date' => '2026-01-01', 'name' => 'New Year'],
            ['date' => '2026-05-01', 'name' => 'Labour Day'],
        ])->assertOk();

        $log = AuditLog::where('action', 'Updated SLA holidays')->firstOrFail();
        $this->assertSame('2026', $log->target);
        $this->assertSame(['added' => ['2026-05-01'], 'removed' => ['2026-02-02'], 'renamed' => ['2026-01-01']], $log->details);
    }
}
