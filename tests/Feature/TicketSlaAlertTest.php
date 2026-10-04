<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketSlaAlertService;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketSlaAlertTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        // Pin "now" to a Wednesday noon — SLA math counts working time.
        $this->travelTo('2026-01-14 12:00:00');
    }

    /** A super user (bypasses permission gates → receives every staff alert). */
    private function staff(string $name = 'Staff One'): User
    {
        return User::factory()->create([
            'name' => $name,
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => $name, 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);
    }

    /** A plain employee account with no staff permissions. */
    private function regularUser(): User
    {
        return User::factory()->create(['role' => 'user']);
    }

    private function sweep(): array
    {
        return app(TicketSlaAlertService::class)->run();
    }

    public function test_unattended_open_ticket_alerts_the_takers_once(): void
    {
        $staff = $this->staff();
        $regular = $this->regularUser();
        // Waiting since Tuesday morning — the 120m response target blew long ago.
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-13 08:00:00']);

        $sent = $this->sweep();

        $this->assertSame(1, $sent['over_sla']);
        $this->assertSame(1, $staff->notifications()->count());
        $this->assertSame('ticket_sla', $staff->notifications()->first()->data['type']);
        $this->assertSame('response_over_sla', $staff->notifications()->first()->data['subtype']);
        // Non-staff users never receive SLA alerts.
        $this->assertSame(0, $regular->notifications()->count());

        // A second sweep must not re-fire the same warning.
        $again = $this->sweep();
        $this->assertSame(0, $again['over_sla']);
        $this->assertSame(1, $staff->notifications()->count());
    }

    public function test_near_due_in_progress_ticket_nudges_only_the_assignee(): void
    {
        $assignee = $this->staff('Assignee');
        $other = $this->staff('Bystander');
        // Critical resolve = 4 wh; created 08:40 → 200/240 minutes spent (83%) → at risk.
        Ticket::factory()->create([
            'status' => 'in_progress', 'priority' => 'critical',
            'assignee_id' => $assignee->id,
            'created_at' => '2026-01-14 08:40:00', 'responded_at' => '2026-01-14 08:45:00',
        ]);

        $sent = $this->sweep();

        $this->assertSame(1, $sent['near_due']);
        $this->assertSame('resolve_near_due', $assignee->notifications()->first()->data['subtype']);
        // An at-risk nudge stays with the assignee — no escalation yet.
        $this->assertSame(0, $other->notifications()->count());
    }

    public function test_over_sla_resolution_escalates_and_the_stages_fire_once_each(): void
    {
        $assignee = $this->staff('Assignee');
        $other = $this->staff('Assigner');
        // Critical resolve = 4 wh from Wednesday 08:40 → due 13:40 (lunch skipped).
        $ticket = Ticket::factory()->create([
            'status' => 'in_progress', 'priority' => 'critical',
            'assignee_id' => $assignee->id,
            'created_at' => '2026-01-14 08:40:00', 'responded_at' => '2026-01-14 08:45:00',
        ]);

        // Noon sweep: at risk → assignee only.
        $this->sweep();
        $this->assertSame(1, $assignee->notifications()->count());
        $this->assertSame(0, $other->notifications()->count());

        // Past the deadline: breach fires once and escalates to assigners too.
        $this->travelTo('2026-01-14 14:00:00');
        $sent = $this->sweep();
        $this->assertSame(1, $sent['over_sla']);
        $this->assertSame(2, $assignee->notifications()->count()); // near_due + over_sla
        $this->assertSame(1, $other->notifications()->count());    // over_sla escalation only
        $this->assertSame('over_sla', $ticket->fresh()->sla_resolve_alert_level);

        // Nothing new on the next pass.
        $again = $this->sweep();
        $this->assertSame(['near_due' => 0, 'over_sla' => 0], $again);
    }

    public function test_taking_the_ticket_resets_the_resolution_alert_stage(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff);
        // Breached response: alert stage recorded for the response clock.
        $ticket = Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-13 08:00:00']);
        $this->sweep();
        $this->assertSame('over_sla', $ticket->fresh()->sla_response_alert_level);

        // Taking it pins a fresh resolution deadline — its alert stage starts clean.
        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])->assertOk();
        $this->assertNull($ticket->fresh()->sla_resolve_alert_level);
    }
}
