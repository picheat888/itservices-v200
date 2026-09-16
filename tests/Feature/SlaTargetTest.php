<?php

namespace Tests\Feature;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketService;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Which resolution target a case is judged against.
 *
 * Priority answers "how urgent", and it was the only thing the target could be keyed on. But a
 * case opened from a request has a length decided by WHAT WAS ASKED FOR — a monitor has to be
 * procured whether or not the technician marks it urgent — and that was unrepresentable. These
 * tests pin the order (request type → priority → built-in default) and the consequences of it.
 */
class SlaTargetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The rules are memoized per process, and a rolled-back test leaves that memo behind.
        TicketSla::flush();
    }

    private function staff(): User
    {
        $employee = Employee::create(['first_name' => 'Tech', 'last_name' => 'Test', 'status' => 'active']);

        return User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);
    }

    /** A ticket with a service request of $type attached, the way an auto-opened case is. */
    private function ticketFromRequest(string $type, array $overrides = []): Ticket
    {
        $ticket = Ticket::factory()->create($overrides);
        ServiceRequest::create([
            'reference' => 'RQ-2026-'.fake()->unique()->numberBetween(1000, 9999),
            'type' => $type,
            'origin' => 'direct',
            'user_id' => $this->staff()->id,
            'requester_name' => 'Somebody',
            'title' => 'A thing was requested',
            'reason' => 'Because the old one stopped working.',
            'status' => 'approved',
            'ticket_id' => $ticket->id,
        ]);

        return $ticket->fresh();
    }

    private function rule(SlaScope $scope, string $value, int $hours, bool $enabled = true): SlaTarget
    {
        return SlaTarget::create([
            'scope' => $scope->value,
            'match_value' => $value,
            'resolve_hours' => $hours,
            'enabled' => $enabled,
        ]);
    }

    public function test_a_case_with_no_rules_falls_back_to_the_built_in_default(): void
    {
        $ticket = Ticket::factory()->create(['priority' => TicketPriority::High]);

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(8, $target['hours'], 'the shipped default for high');
        // Reported as nobody's choice, which is exactly what it is.
        $this->assertNull($target['scope']);
    }

    public function test_a_priority_rule_overrides_the_default(): void
    {
        $this->rule(SlaScope::Priority, 'high', 3);
        $ticket = Ticket::factory()->create(['priority' => TicketPriority::High]);

        $target = TicketSla::targetFor($ticket);

        $this->assertSame(3, $target['hours']);
        $this->assertSame(SlaScope::Priority, $target['scope']);
    }

    public function test_the_request_type_beats_the_priority(): void
    {
        $this->rule(SlaScope::Priority, 'critical', 4);
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $ticket = $this->ticketFromRequest('computer', ['priority' => TicketPriority::Critical]);

        $target = TicketSla::targetFor($ticket);

        // Urgent AND three days long: the length of the work is the thing being measured.
        $this->assertSame(72, $target['hours']);
        $this->assertSame(SlaScope::RequestType, $target['scope']);
        $this->assertSame('computer', $target['value']);
    }

    public function test_a_switched_off_rule_is_ignored(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72, enabled: false);
        $this->rule(SlaScope::Priority, 'critical', 4);
        $ticket = $this->ticketFromRequest('computer', ['priority' => TicketPriority::Critical]);

        // Switched off, not deleted — the number is kept, it just stops applying.
        $this->assertSame(4, TicketSla::targetFor($ticket)['hours']);
    }

    public function test_a_case_nobody_requested_is_untouched_by_request_rules(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $ticket = Ticket::factory()->create(['priority' => TicketPriority::Medium]);

        $this->assertSame(24, TicketSla::targetFor($ticket)['hours']);
        $this->assertNull(TicketSla::targetFor($ticket)['scope']);
    }

    public function test_taking_a_case_does_not_shorten_a_request_type_deadline(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $this->rule(SlaScope::Priority, 'critical', 4);
        $ticket = $this->ticketFromRequest('computer');
        $ticket->forceFill(['sla_resolve_due_at' => TicketSla::resolveDueAt($ticket)])->save();
        $due = $ticket->fresh()->sla_resolve_due_at;

        app(TicketService::class)->take($ticket->fresh(), $this->staff(), TicketPriority::Critical, null, null);

        // Marking it urgent does not make the vendor deliver faster.
        $this->assertEquals($due, $ticket->fresh()->sla_resolve_due_at);
    }

    public function test_taking_an_ordinary_case_still_sets_the_deadline_from_the_priority(): void
    {
        $this->rule(SlaScope::Priority, 'critical', 4);
        $ticket = Ticket::factory()->create(['status' => 'open', 'sla_resolve_due_at' => now()->addYear()]);

        app(TicketService::class)->take($ticket, $this->staff(), TicketPriority::Critical, null, null);

        $expected = TicketSla::addBusinessMinutes($ticket->created_at, 4 * 60);
        $this->assertEquals($expected, $ticket->fresh()->sla_resolve_due_at);
    }

    public function test_the_deadline_and_the_verdict_use_the_request_type_target(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $ticket = $this->ticketFromRequest('computer', ['priority' => TicketPriority::Critical]);

        $expected = TicketSla::addBusinessMinutes($ticket->created_at, 72 * 60);
        $this->assertEquals($expected, TicketSla::resolveDueAt($ticket));
        $this->assertSame($expected->toIso8601String(), TicketSla::forTicket($ticket)['resolve_due_at']);
    }

    /** An administrator with the SLA settings gate. */
    private function admin(): User
    {
        $user = $this->staff();
        RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => 'settings.sla'], ['allowed' => true]);

        return $user->refresh();
    }

    public function test_settings_saves_priority_and_request_targets_as_rows(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', [
                'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
                'ticket_sla_request' => [
                    ['type' => 'computer', 'resolve' => 72, 'enabled' => true],
                    ['type' => 'mailgroup', 'resolve' => 2, 'enabled' => false],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.ticket_sla.critical.resolve', 4)
            ->assertJsonPath('data.ticket_sla_request.0.type', 'computer')
            ->assertJsonPath('data.ticket_sla_request.1.enabled', false);

        $this->assertDatabaseHas('sla_targets', ['scope' => 'request_type', 'match_value' => 'computer', 'resolve_hours' => 72]);
        $this->assertDatabaseHas('sla_targets', ['scope' => 'priority', 'match_value' => 'critical', 'resolve_hours' => 4]);
    }

    public function test_a_request_target_left_out_of_the_save_is_deleted(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $this->rule(SlaScope::RequestType, 'mailgroup', 2);

        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', [
                'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
                // The screen sends the whole list, so dropping a row here removes it.
                'ticket_sla_request' => [['type' => 'computer', 'resolve' => 72]],
            ])->assertOk();

        $this->assertDatabaseHas('sla_targets', ['scope' => 'request_type', 'match_value' => 'computer']);
        $this->assertDatabaseMissing('sla_targets', ['scope' => 'request_type', 'match_value' => 'mailgroup']);
    }

    public function test_saving_the_priority_form_alone_leaves_request_targets_alone(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);

        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', [
                'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
            ])->assertOk();

        $this->assertDatabaseHas('sla_targets', ['scope' => 'request_type', 'match_value' => 'computer', 'resolve_hours' => 72]);
    }

    public function test_an_unknown_request_type_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', [
                'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
                'ticket_sla_request' => [['type' => 'teleportation', 'resolve' => 8]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ticket_sla_request.0.type']);
    }

    public function test_changing_a_request_target_moves_the_deadlines_of_open_cases(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 8);
        $ticket = $this->ticketFromRequest('computer', ['status' => 'open']);
        $ticket->forceFill(['sla_resolve_due_at' => TicketSla::resolveDueAt($ticket)])->save();
        $before = $ticket->fresh()->sla_resolve_due_at;

        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', [
                'ticket_sla' => ['critical' => ['resolve' => 4], 'high' => ['resolve' => 8], 'medium' => ['resolve' => 24], 'low' => ['resolve' => 72]],
                'ticket_sla_request' => [['type' => 'computer', 'resolve' => 72]],
            ])->assertOk();

        // The stored column is what the list sorts and the overdue filter reads, so it has to move.
        $this->assertTrue($ticket->fresh()->sla_resolve_due_at->greaterThan($before));
    }

    public function test_the_case_says_where_its_target_came_from(): void
    {
        $this->rule(SlaScope::RequestType, 'computer', 72);
        $ticket = $this->ticketFromRequest('computer', ['priority' => TicketPriority::Critical]);

        $this->actingAs($this->staff())
            ->getJson("/api/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.sla_target.scope', 'request_type')
            ->assertJsonPath('data.sla_target.value', 'computer')
            ->assertJsonPath('data.sla_target.hours', 72);
    }
}
