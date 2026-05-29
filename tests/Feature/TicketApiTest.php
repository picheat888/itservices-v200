<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketApiTest extends TestCase
{
    use RefreshDatabase;

    /** A standalone employee record. */
    private function employee(string $name = 'Requester One'): Employee
    {
        return Employee::create(['name' => $name, 'status' => 'active']);
    }

    /** A login account linked to a fresh employee. Super bypasses permission gates. */
    private function userWithEmployee(string $role = 'super'): User
    {
        return User::factory()->create([
            'role' => $role,
            'employee_id' => $this->employee()->id,
        ]);
    }

    /** Valid create-ticket payload. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'subject' => 'Cannot connect to production VPN',
            'description' => 'VPN client fails to authenticate since this morning.',
            'category' => 'network',
            'callback_phone' => '+66 81 234 5678',
        ], $overrides);
    }

    public function test_guests_cannot_list_tickets(): void
    {
        $this->getJson('/api/tickets')->assertUnauthorized();
    }

    public function test_requester_can_create_a_ticket(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->postJson('/api/tickets', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.priority', null)
            ->assertJsonPath('data.assignee_id', null)
            ->assertJsonPath('data.ticket_no', fn ($no) => is_string($no) && str_starts_with($no, 'TKT-'));
    }

    public function test_create_validates_subject_and_description(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->postJson('/api/tickets', $this->payload(['subject' => 'no', 'description' => 'short']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['subject', 'description']);
    }

    public function test_user_without_create_permission_is_forbidden(): void
    {
        // A plain 'user' has no seeded role_permissions in this test DB → denied.
        $this->actingAs($this->userWithEmployee('user'));

        $this->postJson('/api/tickets', $this->payload())->assertForbidden();
    }

    public function test_it_staff_can_take_an_open_ticket(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create();
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'high', 'note' => 'Verified by phone'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_progress')
            ->assertJsonPath('data.priority', 'high')
            ->assertJsonPath('data.assignee_id', $staff->id);
    }

    public function test_cannot_take_an_already_assigned_ticket(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);
        $this->actingAs($this->userWithEmployee('super'));

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])->assertStatus(422);
    }

    public function test_super_can_assign_a_ticket_to_a_staff_member(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create();
        $this->actingAs($this->userWithEmployee('super'));

        $this->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $staff->id, 'priority' => 'critical'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_progress')
            ->assertJsonPath('data.assignee_id', $staff->id)
            ->assertJsonPath('data.priority', 'critical');
    }

    public function test_assignee_can_complete_a_ticket_with_resolution(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress', 'priority' => 'medium']);
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/resolve", ['mode' => 'complete', 'resolution' => 'Reinstalled the VPN client and reconnected.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.resolution', 'Reinstalled the VPN client and reconnected.');

        $this->assertNotNull($ticket->fresh()->resolved_at);
    }

    public function test_resolution_requires_minimum_length(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/resolve", ['mode' => 'cancel', 'resolution' => 'too short'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['resolution']);
    }

    public function test_only_the_assignee_can_resolve(): void
    {
        $owner = $this->userWithEmployee('super');
        $other = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $owner->id, 'status' => 'in_progress']);
        $this->actingAs($other);

        $this->postJson("/api/tickets/{$ticket->id}/resolve", ['mode' => 'complete', 'resolution' => 'Trying to close another staff case.'])
            ->assertForbidden();
    }

    public function test_requester_sees_only_their_own_tickets(): void
    {
        $me = $this->userWithEmployee('user');
        Ticket::factory()->create(['requester_id' => $me->employee_id]);
        Ticket::factory()->create(); // someone else's
        $this->actingAs($me);

        $this->getJson('/api/tickets')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_super_sees_all_tickets(): void
    {
        Ticket::factory()->count(3)->create();
        $this->actingAs($this->userWithEmployee('super'));

        $this->getJson('/api/tickets')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_delete_requires_permission(): void
    {
        $ticket = Ticket::factory()->create();

        $this->actingAs($this->userWithEmployee('user'));
        $this->deleteJson("/api/tickets/{$ticket->id}")->assertForbidden();

        $this->actingAs($this->userWithEmployee('super'));
        $this->deleteJson("/api/tickets/{$ticket->id}")->assertOk();
        $this->assertDatabaseMissing('tickets', ['id' => $ticket->id]);
    }
}
