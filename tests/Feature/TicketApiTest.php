<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
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

    public function test_staff_cannot_take_a_case_they_filed_themselves(): void
    {
        // Anti case-pumping: filing your own case and taking it would game the SLA stats.
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['requester_id' => $staff->employee_id]);
        $this->actingAs($staff);

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])->assertStatus(422);
    }

    public function test_a_case_cannot_be_assigned_to_its_requester(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['requester_id' => $staff->employee_id]);
        $this->actingAs($this->userWithEmployee('super'));

        $this->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $staff->id, 'priority' => 'low'])
            ->assertStatus(422);
    }

    public function test_assignee_can_forward_their_case_to_another_staff(): void
    {
        $owner = $this->userWithEmployee('super');
        $next = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $owner->id, 'status' => 'in_progress', 'priority' => 'high']);
        $this->actingAs($owner);

        $this->postJson("/api/tickets/{$ticket->id}/forward", ['assignee_id' => $next->id])
            ->assertOk()
            ->assertJsonPath('data.assignee_id', $next->id)
            // Forwarding never restarts a clock or resets the priority.
            ->assertJsonPath('data.priority', 'high')
            ->assertJsonPath('data.status', 'in_progress');

        // The receiving staff gets a bell pointing at the case.
        $this->assertSame('ticket_forwarded', $next->notifications()->first()->data['type']);
    }

    public function test_forwarding_is_blocked_for_bystanders_requesters_and_open_cases(): void
    {
        $owner = $this->userWithEmployee('super');
        $next = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $owner->id, 'status' => 'in_progress']);

        // A user with no assign permission who isn't the assignee is refused.
        $this->actingAs($this->userWithEmployee('user'));
        $this->postJson("/api/tickets/{$ticket->id}/forward", ['assignee_id' => $next->id])->assertForbidden();

        // The requester can never receive their own case.
        $requesterStaff = $this->userWithEmployee('super');
        $ticket->update(['requester_id' => $requesterStaff->employee_id]);
        $this->actingAs($owner);
        $this->postJson("/api/tickets/{$ticket->id}/forward", ['assignee_id' => $requesterStaff->id])->assertStatus(422);

        // Open cases use take/assign, not forward.
        $open = Ticket::factory()->create(['status' => 'open']);
        $this->actingAs($this->userWithEmployee('super'));
        $this->postJson("/api/tickets/{$open->id}/forward", ['assignee_id' => $next->id])->assertStatus(422);
    }

    public function test_cannot_take_an_already_assigned_ticket(): void
    {
        $staff = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);
        $this->actingAs($this->userWithEmployee('super'));

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])->assertStatus(422);
    }

    public function test_a_dispatcher_cannot_assign_a_case_to_themselves(): void
    {
        // Taking a case yourself goes through Take Case, not Assign.
        $me = $this->userWithEmployee('super');
        $ticket = Ticket::factory()->create();
        $this->actingAs($me);

        $this->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $me->id, 'priority' => 'low'])
            ->assertStatus(422);
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

    public function test_meta_reports_the_open_count_ignoring_filters(): void
    {
        $this->actingAs($this->userWithEmployee('super'));
        Ticket::factory()->count(2)->create(['status' => 'open']);
        Ticket::factory()->create(['status' => 'completed']);

        // The badge count stays put even when the list itself is filtered away from Open.
        $this->getJson('/api/tickets?status=completed')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.open_count', 2);
    }

    public function test_meta_reports_my_unfinished_jobs(): void
    {
        $me = $this->userWithEmployee('super');
        $this->actingAs($me);
        Ticket::factory()->count(2)->create(['assignee_id' => $me->id, 'status' => 'in_progress']);
        Ticket::factory()->create(['assignee_id' => $me->id, 'status' => 'completed']); // finished — not counted
        Ticket::factory()->create(['status' => 'in_progress']);                         // someone else's — not counted

        $this->getJson('/api/tickets')->assertOk()->assertJsonPath('meta.my_jobs_count', 2);
    }

    public function test_meta_reports_my_unresolved_requests(): void
    {
        $me = $this->userWithEmployee('super');
        $this->actingAs($me);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'in_progress']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'completed']); // closed — not counted
        Ticket::factory()->create(['status' => 'open']);                                          // someone else's — not counted

        $this->getJson('/api/tickets')->assertOk()->assertJsonPath('meta.my_tickets_count', 2);
    }

    public function test_sidebar_badge_counts_attention_tickets_once_each(): void
    {
        $me = $this->userWithEmployee('super');
        $this->actingAs($me);
        Ticket::factory()->create(['status' => 'open']);                                       // waiting for a take
        Ticket::factory()->create(['assignee_id' => $me->id, 'status' => 'in_progress']);      // my unfinished job
        // Overlap: I filed it AND it's open-unassigned — must count once, not twice.
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        Ticket::factory()->create(['status' => 'completed']);                                  // closed — not counted

        $this->getJson('/api/tickets/badge')->assertOk()->assertJsonPath('count', 3);
    }

    public function test_sidebar_badge_for_a_regular_user_covers_only_their_requests(): void
    {
        $me = $this->userWithEmployee('user');
        $this->actingAs($me);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']); // mine — counted
        Ticket::factory()->create(['status' => 'open']); // waiting for IT — not my action

        $this->getJson('/api/tickets/badge')->assertOk()->assertJsonPath('count', 1);
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

    public function test_admins_cannot_edit_someone_elses_ticket(): void
    {
        // Editing is requester-only — even super has no override.
        $ticket = Ticket::factory()->create(['category' => 'network', 'status' => 'open']);
        $this->actingAs($this->userWithEmployee('super'));

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())->assertForbidden();
    }

    public function test_requester_can_edit_their_own_open_ticket(): void
    {
        $me = $this->userWithEmployee('user');
        RolePermission::create(['role_id' => $me->role_id, 'permission' => 'tickets.edit_own', 'allowed' => true]);
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        $this->actingAs($me);

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())
            ->assertOk()
            ->assertJsonPath('data.subject', 'Updated — printer still jams on tray 2')
            ->assertJsonPath('data.category', 'hardware')
            // Workflow fields are untouched by an edit.
            ->assertJsonPath('data.status', 'open');
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

    public function test_editing_requires_the_edit_own_permission(): void
    {
        // Same requester + open case, but the role was never granted tickets.edit_own.
        $me = $this->userWithEmployee('user');
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        $this->actingAs($me);

        $this->putJson("/api/tickets/{$ticket->id}", $this->updatePayload())->assertForbidden();
    }

    public function test_update_validates_fields(): void
    {
        // Validation runs for the requester editing their own open ticket.
        $me = $this->userWithEmployee('user');
        RolePermission::create(['role_id' => $me->role_id, 'permission' => 'tickets.edit_own', 'allowed' => true]);
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        $this->actingAs($me);

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

    public function test_my_jobs_lists_active_work_before_finished_work(): void
    {
        $staff = $this->userWithEmployee('super');
        $this->actingAs($staff);

        // Finished jobs are newer than the active one — the group order must still win.
        $active = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);
        $completed = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'completed']);
        $canceled = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'canceled']);
        Ticket::factory()->create(['status' => 'in_progress']); // someone else's — excluded by mine

        $this->getJson('/api/tickets?mine=1')->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.id', $active->id)
            // Within the finished group the default newest-first order still applies.
            ->assertJsonPath('data.1.id', $canceled->id)
            ->assertJsonPath('data.2.id', $completed->id);
    }

    public function test_my_tickets_scope_returns_only_tickets_the_user_filed(): void
    {
        $me = $this->userWithEmployee('super'); // super bypasses the tickets.my gate
        Ticket::factory()->create(['requester_id' => $me->employee_id]);
        $other = Ticket::factory()->create(); // someone else's request
        $this->actingAs($me);

        $this->getJson('/api/tickets?requested=1')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissing(['id' => $other->id]);
    }

    public function test_my_tickets_scope_requires_the_tickets_my_permission(): void
    {
        // A plain 'user' has no seeded role_permissions in this test DB → denied.
        $this->actingAs($this->userWithEmployee('user'));

        $this->getJson('/api/tickets?requested=1')->assertForbidden();
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
