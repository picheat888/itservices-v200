<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class TicketSlaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Targets/window are memoized statically per process — reset between tests.
        TicketSla::flush();
        // SLA math counts working time (Mon–Fri 08:00–17:00 by default), so results
        // depend on the calendar — pin "now" to a Wednesday noon for every test.
        $this->travelTo('2026-01-14 12:00:00');
    }

    private function super(): User
    {
        return User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => 'Boss', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);
    }

    public function test_sla_met_pct_uses_priority_resolution_targets(): void
    {
        $this->actingAs($this->super());

        // Critical target = 4 working hours. Closed in 1.5h → met; a ticket from
        // Tuesday closed Wednesday → missed (its business due passed Tuesday noon).
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => '2026-01-14 08:30:00', 'resolved_at' => '2026-01-14 10:00:00',
        ]);
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => '2026-01-13 08:30:00', 'resolved_at' => '2026-01-14 09:00:00',
        ]);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('sla_met_pct', 50);
    }

    public function test_summary_counts_cases_currently_past_their_sla(): void
    {
        $this->actingAs($this->super());

        // Open & untaken with the response deadline passed → breached now.
        Ticket::factory()->create(['status' => 'open', 'sla_response_due_at' => now()->subHour()]);
        // In progress with the resolution deadline still ahead → not breached.
        Ticket::factory()->create(['status' => 'in_progress', 'sla_resolve_due_at' => now()->addHour()]);
        // Already closed tickets never count, however old their deadline.
        Ticket::factory()->create(['status' => 'completed', 'sla_resolve_due_at' => now()->subDay()]);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('sla_breached_now', 1);
    }

    public function test_sla_target_is_configurable_in_settings(): void
    {
        $this->actingAs($this->super());

        // Tighten critical resolution to 1h, then a 2h close should now miss. Targets are rows
        // now (sla_targets), not a JSON blob in app_settings — see SlaTargetTest.
        SlaTarget::create(['scope' => SlaScope::Priority->value, 'match_value' => 'critical', 'resolve_hours' => 1]);
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => '2026-01-14 08:00:00', 'resolved_at' => '2026-01-14 10:00:00',
        ]);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('sla_met_pct', 0);
    }

    public function test_response_sla_met_pct_uses_business_time(): void
    {
        $this->actingAs($this->super());

        // Medium response target = 120 working minutes.
        // Filed Friday 16:30, taken Monday 08:03 → only 33 working minutes → met.
        Ticket::factory()->create([
            'status' => 'in_progress',
            'created_at' => '2026-01-09 16:30:00', 'responded_at' => '2026-01-12 08:03:00',
        ]);
        // Filed Wednesday 08:00, taken 11:00 → 180 working minutes → missed.
        Ticket::factory()->create([
            'status' => 'in_progress',
            'created_at' => '2026-01-14 08:00:00', 'responded_at' => '2026-01-14 11:00:00',
        ]);
        // Still open (never responded) — not counted in this metric.
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-12 08:00:00']);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('response_sla_met_pct', 50);
    }

    public function test_response_sla_is_null_without_responses(): void
    {
        $this->actingAs($this->super());
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-14 08:00:00']);

        // The configured target rides along so the dashboard card can show it.
        $this->getJson('/api/tickets/summary')->assertOk()
            ->assertJsonPath('response_sla_met_pct', null)
            ->assertJsonPath('response_target_minutes', 120);
    }

    public function test_avg_response_minutes_is_computed(): void
    {
        $this->actingAs($this->super());

        Ticket::factory()->create(['created_at' => now()->subMinutes(100), 'responded_at' => now()->subMinutes(70)]); // 30m
        Ticket::factory()->create(['created_at' => now()->subMinutes(100), 'responded_at' => now()->subMinutes(10)]); // 90m
        // Previous window (responded 40 days ago): avg 90m → this window is 30m faster.
        Ticket::factory()->create(['created_at' => now()->subDays(40)->subMinutes(90), 'responded_at' => now()->subDays(40)]);

        $this->getJson('/api/tickets/summary')->assertOk()
            ->assertJsonPath('avg_response_minutes', 60)
            ->assertJsonPath('avg_response_delta_minutes', -30);
    }

    public function test_summary_accepts_a_custom_date_range(): void
    {
        $this->actingAs($this->super());
        // Inside the custom window (Jan 5–9) vs outside it (Jan 12).
        Ticket::factory()->create(['created_at' => '2026-01-07 10:00:00']);
        Ticket::factory()->create(['created_at' => '2026-01-12 10:00:00']);

        $this->getJson('/api/tickets/summary?from=2026-01-05&to=2026-01-09')->assertOk()
            ->assertJsonPath('created', 1)
            ->assertJsonPath('range_days', 5);

        // An inverted pair is rejected, and both ends are required together.
        $this->getJson('/api/tickets/summary?from=2026-01-09&to=2026-01-05')->assertStatus(422);
        $this->getJson('/api/tickets/summary?from=2026-01-05')->assertStatus(422);
    }

    public function test_metrics_are_null_without_data(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/tickets/summary')->assertOk()
            ->assertJsonPath('sla_met_pct', null)
            ->assertJsonPath('avg_response_minutes', null);
    }

    public function test_settings_expose_and_persist_sla_targets(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/settings')->assertOk()->assertJsonPath('data.ticket_sla.critical.resolve', 4);

        $this->putJson('/api/settings/sla', ['ticket_sla' => [
            'critical' => ['response' => 10, 'resolve' => 2],
            'high' => ['response' => 30, 'resolve' => 8],
            'medium' => ['response' => 120, 'resolve' => 24],
            'low' => ['response' => 240, 'resolve' => 72],
        ]])->assertOk()->assertJsonPath('data.ticket_sla.critical.resolve', 2);
    }

    // ---- Per-ticket SLA clocks (TicketSla::forTicket) ----

    public function test_open_ticket_runs_against_the_response_clock(): void
    {
        // No priority yet → medium response target (120m). 10m in → on track, ~8%.
        $sla = TicketSla::forTicket(Ticket::factory()->make(['status' => 'open', 'created_at' => now()->subMinutes(10)]));

        $this->assertSame('on_track', $sla['state']);
        $this->assertSame(8, $sla['pct_elapsed']);

        // 110m in (92%) → at risk; 130m in → response target blown.
        $atRisk = TicketSla::forTicket(Ticket::factory()->make(['status' => 'open', 'created_at' => now()->subMinutes(110)]));
        $this->assertSame('at_risk', $atRisk['state']);

        $breached = TicketSla::forTicket(Ticket::factory()->make(['status' => 'open', 'created_at' => now()->subMinutes(130)]));
        $this->assertSame('breached', $breached['state']);
    }

    public function test_in_progress_ticket_runs_against_the_resolution_clock(): void
    {
        // Critical resolve target = 4h. 1h in (25%) → on track even though the
        // 15m response target has long passed — response was already given.
        $base = ['status' => 'in_progress', 'priority' => 'critical', 'responded_at' => now()->subMinutes(50)];
        $sla = TicketSla::forTicket(Ticket::factory()->make([...$base, 'created_at' => now()->subHour()]));
        $this->assertSame('on_track', $sla['state']);

        $atRisk = TicketSla::forTicket(Ticket::factory()->make([...$base, 'created_at' => now()->subMinutes(200)]));
        $this->assertSame('at_risk', $atRisk['state']);

        // Filed Tuesday 16:00: 1 working hour Tuesday + 3 Wednesday → due 11:00, now past it.
        $breached = TicketSla::forTicket(Ticket::factory()->make([...$base, 'created_at' => '2026-01-13 16:00:00']));
        $this->assertSame('breached', $breached['state']);
    }

    public function test_completed_ticket_reports_the_final_verdict(): void
    {
        // Critical filed 08:00 Wednesday → business due 12:00 the same day.
        $met = TicketSla::forTicket(Ticket::factory()->make([
            'status' => 'completed', 'priority' => 'critical',
            'created_at' => '2026-01-14 08:00:00', 'resolved_at' => '2026-01-14 10:00:00',
        ]));
        $this->assertSame('met', $met['state']);
        $this->assertSame(100, $met['pct_elapsed']);

        $missed = TicketSla::forTicket(Ticket::factory()->make([
            'status' => 'completed', 'priority' => 'critical',
            'created_at' => '2026-01-14 08:00:00', 'resolved_at' => '2026-01-14 13:00:00',
        ]));
        $this->assertSame('missed', $missed['state']);
    }

    public function test_canceled_ticket_has_no_sla(): void
    {
        $this->assertNull(TicketSla::forTicket(Ticket::factory()->make(['status' => 'canceled', 'created_at' => now()->subHour()])));
    }

    public function test_ticket_list_includes_the_sla_snapshot(): void
    {
        $this->actingAs($this->super());
        Ticket::factory()->create(['status' => 'open', 'created_at' => now()->subMinutes(10)]);

        $this->getJson('/api/tickets')->assertOk()
            ->assertJsonPath('data.0.sla.state', 'on_track')
            ->assertJsonPath('data.0.sla.response_due_at', fn ($v) => is_string($v) && $v !== '');
    }

    // ---- Business-hours clock (Mon–Fri 08:00–17:00 by default) ----

    public function test_target_spills_into_the_next_working_day(): void
    {
        // Response = 120m (system-wide), filed Friday 16:50: 10m left Friday, 110m Monday.
        $sla = TicketSla::forTicket(Ticket::factory()->make([
            'status' => 'open', 'priority' => 'critical', 'created_at' => '2026-01-16 16:50:00',
        ]));

        $this->assertStringStartsWith('2026-01-19T09:50:00', $sla['response_due_at']);
    }

    public function test_response_target_is_a_single_configurable_value(): void
    {
        // Tighten the system-wide first-response target to 15 minutes.
        AppSetting::put(TicketSla::RESPONSE_KEY, '15');
        TicketSla::flush();

        $sla = TicketSla::forTicket(Ticket::factory()->make([
            'status' => 'open', 'priority' => 'critical', 'created_at' => '2026-01-16 16:50:00',
        ]));

        // 10m left Friday, 5m Monday.
        $this->assertStringStartsWith('2026-01-19T08:05:00', $sla['response_due_at']);
    }

    public function test_weekend_ticket_starts_its_clock_monday_morning(): void
    {
        // Filed Saturday: no working time has elapsed yet — clock opens Monday 08:00.
        $this->travelTo('2026-01-17 12:00:00'); // Saturday noon
        $sla = TicketSla::forTicket(Ticket::factory()->make(['status' => 'open', 'created_at' => '2026-01-17 10:00:00']));

        $this->assertSame('on_track', $sla['state']);
        $this->assertSame(0, $sla['pct_elapsed']);
        // Medium response = 120m → due Monday 10:00.
        $this->assertStringStartsWith('2026-01-19T10:00:00', $sla['response_due_at']);
    }

    public function test_working_window_is_configurable(): void
    {
        // Extend the window to Mon–Sat 08:00–20:00: the Friday-16:50 ticket's
        // 120m response target now fits the same evening.
        AppSetting::put(TicketSla::HOURS_KEY, json_encode(['days' => [1, 2, 3, 4, 5, 6], 'start' => '08:00', 'end' => '20:00']));
        TicketSla::flush();

        $sla = TicketSla::forTicket(Ticket::factory()->make([
            'status' => 'open', 'priority' => 'critical', 'created_at' => '2026-01-16 16:50:00',
        ]));

        $this->assertStringStartsWith('2026-01-16T18:50:00', $sla['response_due_at']);
    }

    public function test_lunch_break_is_not_counted(): void
    {
        // Default break 12:00–13:00: an hour spanning lunch costs no business time.
        $this->assertSame(120, TicketSla::businessMinutesBetween(
            Carbon::parse('2026-01-14 11:00:00'),
            Carbon::parse('2026-01-14 14:00:00'),
        ));

        // 60 working minutes from 11:30 lands at 13:30 — the due jumps the break.
        $this->assertSame(
            '2026-01-14 13:30:00',
            TicketSla::addBusinessMinutes(Carbon::parse('2026-01-14 11:30:00'), 60)->toDateTimeString(),
        );
    }

    public function test_ticket_filed_during_lunch_starts_after_the_break(): void
    {
        $this->assertSame(
            '2026-01-14 13:15:00',
            TicketSla::addBusinessMinutes(Carbon::parse('2026-01-14 12:30:00'), 15)->toDateTimeString(),
        );
    }

    public function test_break_can_be_cleared_and_survives_bad_values(): void
    {
        // Explicit nulls = no break (the default lunch hour must NOT sneak back).
        AppSetting::put(TicketSla::HOURS_KEY, json_encode([
            'days' => [1, 2, 3, 4, 5], 'start' => '08:00', 'end' => '17:00', 'break_start' => null, 'break_end' => null,
        ]));
        TicketSla::flush();
        $this->assertNull(TicketSla::hours()['break_start']);

        // A break outside the window is dropped, not applied.
        AppSetting::put(TicketSla::HOURS_KEY, json_encode([
            'days' => [1, 2, 3, 4, 5], 'start' => '08:00', 'end' => '17:00', 'break_start' => '18:00', 'break_end' => '19:00',
        ]));
        TicketSla::flush();
        $this->assertNull(TicketSla::hours()['break_start']);
    }

    public function test_unusable_saved_window_falls_back_to_the_defaults(): void
    {
        AppSetting::put(TicketSla::HOURS_KEY, json_encode(['days' => [], 'start' => '17:00', 'end' => '08:00']));
        TicketSla::flush();

        $this->assertSame(TicketSla::hoursDefaults(), TicketSla::hours());
    }

    // ---- Persisted SLA deadlines (SQL sort/filter) ----

    public function test_create_persists_both_sla_deadlines(): void
    {
        $this->actingAs($this->super());
        $id = $this->postJson('/api/tickets', [
            'subject' => 'VPN drops every few minutes',
            'description' => 'Started this morning, affects the whole team.',
            'category' => 'network',
            'callback_phone' => '081 111 2222',
        ])->assertCreated()->json('data.id');

        $ticket = Ticket::find($id);
        // Parity: the stored columns must equal the live business-time computation.
        $this->assertSame(TicketSla::responseDueAt($ticket)->toDateTimeString(), $ticket->sla_response_due_at->toDateTimeString());
        $this->assertSame(TicketSla::resolveDueAt($ticket)->toDateTimeString(), $ticket->sla_resolve_due_at->toDateTimeString());
    }

    public function test_take_repins_the_resolution_deadline_to_the_chosen_priority(): void
    {
        $staff = $this->super();
        $this->actingAs($staff);
        // Created 08:00 with no priority → resolve due runs on medium (24 wh).
        $ticket = Ticket::factory()->create(['created_at' => '2026-01-14 08:00:00', 'status' => 'open']);

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'critical'])->assertOk();

        // Critical = 4 working hours from 08:00 Wednesday → due 12:00 the same day.
        $this->assertSame('2026-01-14 12:00:00', $ticket->fresh()->sla_resolve_due_at->toDateTimeString());
    }

    public function test_saving_sla_settings_recomputes_active_deadlines(): void
    {
        $this->actingAs($this->super());
        $ticket = Ticket::factory()->create(['created_at' => '2026-01-14 08:00:00', 'status' => 'open']);
        $ticket->update(['sla_response_due_at' => TicketSla::responseDueAt($ticket)]);

        $this->putJson('/api/settings/sla', [
            'ticket_sla' => TicketSla::defaults(),
            'ticket_sla_response' => 30,
        ])->assertOk();

        // 30m from 08:00 → 08:30 under the new target.
        $this->assertSame('2026-01-14 08:30:00', $ticket->fresh()->sla_response_due_at->toDateTimeString());
    }

    public function test_list_sorts_and_filters_by_sla_urgency(): void
    {
        $this->actingAs($this->super());
        // Breached: waiting since Tuesday morning (response due Tue 10:00 << now).
        $breached = Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-13 08:00:00']);
        // On track: filed at 11:00 today (response due 14:00 > now).
        $fresh = Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-14 11:00:00']);
        foreach ([$breached, $fresh] as $t) {
            $t->update(['sla_response_due_at' => TicketSla::responseDueAt($t), 'sla_resolve_due_at' => TicketSla::resolveDueAt($t)]);
        }

        // Most-urgent first: the breached ticket leads even though it's older.
        $this->getJson('/api/tickets?sort=sla_due')->assertOk()->assertJsonPath('data.0.id', $breached->id);

        // The breached filter returns only the overdue one.
        $this->getJson('/api/tickets?sla=breached')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $breached->id);
    }

    public function test_sla_endpoint_persists_the_working_window(): void
    {
        $this->actingAs($this->super());

        $this->putJson('/api/settings/sla', [
            'ticket_sla' => TicketSla::defaults(),
            'ticket_sla_hours' => ['days' => [1, 2, 3, 4, 5, 6], 'start' => '07:30', 'end' => '20:00'],
        ])->assertOk()
            ->assertJsonPath('data.ticket_sla_hours.end', '20:00')
            ->assertJsonPath('data.ticket_sla_hours.days.5', 6);

        // Rejects an inverted window.
        $this->putJson('/api/settings/sla', [
            'ticket_sla' => TicketSla::defaults(),
            'ticket_sla_hours' => ['days' => [1], 'start' => '17:00', 'end' => '08:00'],
        ])->assertStatus(422)->assertJsonValidationErrors(['ticket_sla_hours.end']);
    }

    public function test_granted_user_can_update_sla(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.sla', 'allowed' => true]);

        $this->actingAs($user)
            ->putJson('/api/settings/sla', ['ticket_sla' => ['critical' => ['response' => 15, 'resolve' => 4]]])
            ->assertOk();
    }
}
