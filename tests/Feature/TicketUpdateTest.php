<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Progress notes on a case in flight.
 *
 * The desk could take a case and close a case, and nothing in between: whatever happened over
 * the days the case ran was said out loud and written nowhere. These tests cover who may write
 * a note, when one can be written, and that writing one never moves the case or its clock.
 */
class TicketUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $name = 'Requester One'): Employee
    {
        return Employee::create(['first_name' => $name, 'last_name' => 'Test', 'status' => 'active']);
    }

    /** A login account linked to a fresh employee. Super bypasses the permission gates. */
    private function staff(string $role = 'super'): User
    {
        return User::factory()->create(['role' => $role, 'employee_id' => $this->employee()->id]);
    }

    /** A case already taken by $staff — the only state a progress note can be written in. */
    private function heldBy(User $staff, string $status = 'in_progress'): Ticket
    {
        return Ticket::factory()->create([
            'assignee_id' => $staff->id,
            'status' => $status,
            'requester_id' => $this->employee('Somebody Else')->id,
        ]);
    }

    public function test_the_assignee_writes_a_note_without_moving_the_case(): void
    {
        $staff = $this->staff();
        $ticket = $this->heldBy($staff);
        $due = $ticket->sla_resolve_due_at;
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Replacement roller ordered from the vendor.'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'in_progress')
            ->assertJsonPath('data.updates.0.body', 'Replacement roller ordered from the vendor.')
            ->assertJsonPath('data.updates.0.author_name', $staff->name);

        $this->assertDatabaseHas('ticket_updates', ['ticket_id' => $ticket->id, 'user_id' => $staff->id]);
        // A note says what is happening; it never moves the case or its deadline.
        $this->assertEquals($due, $ticket->fresh()->sla_resolve_due_at);
        $this->assertNull($ticket->fresh()->resolved_at);
    }

    public function test_only_the_assignee_may_write_a_note(): void
    {
        $owner = $this->staff();
        $other = $this->staff();
        $ticket = $this->heldBy($owner);
        $this->actingAs($other);

        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Poking at somebody else s case.'])
            ->assertForbidden();
    }

    public function test_a_case_nobody_has_taken_cannot_be_updated(): void
    {
        $staff = $this->staff();
        $ticket = Ticket::factory()->create(['status' => 'open', 'assignee_id' => null]);
        $this->actingAs($staff);

        // 403 rather than 422: an untaken case has no assignee, so the "only the person
        // holding it" rule is the one that turns this away first.
        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Nothing to report yet.'])
            ->assertForbidden();
    }

    public function test_a_closed_case_cannot_be_updated(): void
    {
        $staff = $this->staff();
        $ticket = $this->heldBy($staff, 'completed');
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'One more thought about it.'])
            ->assertStatus(422);
    }

    public function test_the_note_itself_is_required(): void
    {
        $staff = $this->staff();
        $ticket = $this->heldBy($staff);
        $this->actingAs($staff);

        // An empty note is the silence this whole feature exists to end.
        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['body']);
    }

    public function test_notes_come_back_oldest_first(): void
    {
        $staff = $this->staff();
        $ticket = $this->heldBy($staff);
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'First: opened the machine.']);
        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Second: ordered the part.']);

        $this->getJson("/api/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.updates.0.body', 'First: opened the machine.')
            ->assertJsonPath('data.updates.1.body', 'Second: ordered the part.');
    }

    public function test_notes_are_only_carried_on_the_single_ticket_read(): void
    {
        $staff = $this->staff();
        $ticket = $this->heldBy($staff);
        $this->actingAs($staff);
        $this->postJson("/api/tickets/{$ticket->id}/updates", ['body' => 'Ordered the part.'])->assertCreated();

        // The list has nowhere to show a timeline and would pay for every row's notes.
        $this->getJson('/api/tickets')->assertOk()->assertJsonMissingPath('data.0.updates');
    }
}
