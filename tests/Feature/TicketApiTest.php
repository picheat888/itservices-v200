<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketApiTest extends TestCase
{
    use RefreshDatabase;

    /** A standalone employee record. */
    private function employee(string $name = 'Requester One'): Employee
    {
        return Employee::create(['first_name' => $name, 'last_name' => 'Test', 'status' => 'active']);
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

    public function test_ticket_number_uses_the_category_dated_running_format(): void
    {
        $this->actingAs($this->userWithEmployee());
        $date = now()->format('ymd');

        // Running number restarts per category + day; the category short code is part of the number.
        $nw1 = $this->postJson('/api/tickets', $this->payload(['category' => 'network']))->assertCreated()->json('data.ticket_no');
        $nw2 = $this->postJson('/api/tickets', $this->payload(['category' => 'network']))->assertCreated()->json('data.ticket_no');
        $sw1 = $this->postJson('/api/tickets', $this->payload(['category' => 'software']))->assertCreated()->json('data.ticket_no');

        $this->assertMatchesRegularExpression('/^TKT-(SW|HW|NW|OTH)-\d{6}-\d{3}$/', $nw1);
        $this->assertSame("TKT-NW-{$date}-001", $nw1);
        $this->assertSame("TKT-NW-{$date}-002", $nw2);
        $this->assertSame("TKT-SW-{$date}-001", $sw1); // separate category → its own sequence
    }

    public function test_create_validates_subject_and_description(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->postJson('/api/tickets', $this->payload(['subject' => 'no', 'description' => 'short']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['subject', 'description']);
    }

    public function test_callback_phone_accepts_a_short_internal_extension(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->postJson('/api/tickets', $this->payload(['callback_phone' => '123']))->assertCreated();
    }

    public function test_callback_phone_rejects_fewer_than_three_digits(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->postJson('/api/tickets', $this->payload(['callback_phone' => '12']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('callback_phone');
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

    public function test_tickets_cannot_be_deleted(): void
    {
        $ticket = Ticket::factory()->create();

        // Deleting tickets is not supported for anyone — the destroy route no longer exists.
        $this->actingAs($this->userWithEmployee('super'));
        $this->deleteJson("/api/tickets/{$ticket->id}")->assertMethodNotAllowed();
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id]);
    }

    /** Valid update-ticket payload (descriptive fields only). */
    private function updatePayload(array $overrides = []): array
    {
        return array_merge([
            'subject' => 'Updated — printer still jams on tray 2',
            'description' => 'The paper jam persists after replacing the toner cartridge.',
            'category' => 'hardware',
            'callback_phone' => '+66 82 000 1111',
        ], $overrides);
    }

    public function test_it_staff_can_edit_ticket_fields(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'network', 'status' => 'in_progress']);
        $this->actingAs($this->userWithEmployee('super'));

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())
            ->assertOk()
            ->assertJsonPath('data.subject', 'Updated — printer still jams on tray 2')
            ->assertJsonPath('data.category', 'hardware')
            // Workflow fields are untouched by an edit.
            ->assertJsonPath('data.status', 'in_progress');
    }

    public function test_requester_can_edit_their_own_open_ticket(): void
    {
        $me = $this->userWithEmployee('user');
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        $this->actingAs($me);

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())
            ->assertOk()
            ->assertJsonPath('data.subject', 'Updated — printer still jams on tray 2');
    }

    public function test_requester_cannot_edit_once_the_ticket_is_in_progress(): void
    {
        $me = $this->userWithEmployee('user');
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'in_progress']);
        $this->actingAs($me);

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())->assertForbidden();
    }

    public function test_requester_cannot_edit_another_persons_ticket(): void
    {
        $ticket = Ticket::factory()->create(['status' => 'open']); // someone else's
        $this->actingAs($this->userWithEmployee('user'));

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())->assertForbidden();
    }

    public function test_update_validates_fields(): void
    {
        $ticket = Ticket::factory()->create();
        $this->actingAs($this->userWithEmployee('super'));

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload(['subject' => 'no', 'description' => 'short']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['subject', 'description']);
    }

    public function test_create_links_a_related_asset(): void
    {
        $asset = Asset::factory()->create();
        $this->actingAs($this->userWithEmployee('super'));

        $this->postJson('/api/tickets', $this->payload(['related_asset_id' => $asset->id]))
            ->assertCreated()
            ->assertJsonPath('data.related_asset_id', $asset->id);
    }

    public function test_list_supports_whitelisted_sort_orders(): void
    {
        $this->actingAs($this->userWithEmployee('super'));
        $low = Ticket::factory()->create(['priority' => 'low']);
        $critical = Ticket::factory()->create(['priority' => 'critical']);
        $newest = Ticket::factory()->create(['priority' => null]);

        // Default: newest first.
        $this->getJson('/api/tickets')->assertOk()->assertJsonPath('data.0.id', $newest->id);

        // Oldest first.
        $this->getJson('/api/tickets?sort=created_asc')->assertOk()->assertJsonPath('data.0.id', $low->id);

        // Priority high→low: critical leads, no-priority trails.
        $this->getJson('/api/tickets?sort=priority_desc')->assertOk()
            ->assertJsonPath('data.0.id', $critical->id)
            ->assertJsonPath('data.2.id', $newest->id);

        // Unknown value falls back to the default order rather than erroring.
        $this->getJson('/api/tickets?sort=bogus')->assertOk()->assertJsonPath('data.0.id', $newest->id);
    }

    public function test_summary_reports_backlog_and_respects_the_days_window(): void
    {
        $this->actingAs($this->userWithEmployee('super'));

        // Current backlog: 2 open + 1 in progress (all unresolved).
        Ticket::factory()->count(2)->create(['status' => 'open']);
        Ticket::factory()->create(['status' => 'in_progress']);
        // Created 40 days ago: outside the default 30-day window, inside 90.
        Ticket::factory()->create(['status' => 'open', 'created_at' => now()->subDays(40)]);

        $this->getJson('/api/tickets/summary')->assertOk()
            ->assertJsonPath('range_days', 30)
            ->assertJsonPath('backlog', 4)
            ->assertJsonPath('backlog_open', 3)
            ->assertJsonPath('backlog_in_progress', 1)
            ->assertJsonPath('created', 3); // the 40-day-old ticket falls outside 30d

        $this->getJson('/api/tickets/summary?days=90')->assertOk()
            ->assertJsonPath('range_days', 90)
            ->assertJsonPath('created', 4); // now the older ticket counts too
    }

    public function test_summary_rejects_an_unsupported_window_and_falls_back_to_30(): void
    {
        $this->actingAs($this->userWithEmployee('super'));

        $this->getJson('/api/tickets/summary?days=365')->assertOk()->assertJsonPath('range_days', 30);
    }
}
