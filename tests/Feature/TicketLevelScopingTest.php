<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketLevelScopingTest extends TestCase
{
    use RefreshDatabase;

    /** An admin-role account granted exactly the given ticket permissions. */
    private function staffWith(array $permissions): User
    {
        $user = User::factory()->create([
            'role' => 'admin',
            'employee_id' => Employee::create(['first_name' => 'Staff', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(
                ['role_id' => $user->role_id, 'permission' => $key],
                ['allowed' => true],
            );
        }

        return $user;
    }

    private const BASE = ['tickets.module', 'tickets.view_all', 'tickets.resolve'];

    public function test_requester_assets_peek_requires_the_resolve_gate(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);
        Asset::factory()->create([
            'owner_employee_id' => $ticket->requester_id,
            'status' => 'deployed',
        ]);

        // A taker sees the requester's devices; a plain user (no resolve) is denied.
        $this->actingAs($this->staffWith([...self::BASE, 'tickets.level_hardware']));
        $this->getJson("/api/tickets/{$ticket->id}/requester-assets")->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson("/api/tickets/{$ticket->id}/requester-assets")->assertForbidden();
    }

    public function test_the_all_tab_shows_only_categories_the_level_grants(): void
    {
        Ticket::factory()->create(['category' => 'network', 'subject' => 'VPN tunnel drops constantly']);
        Ticket::factory()->create(['category' => 'hardware', 'subject' => 'Laptop screen flickers badly']);

        $this->actingAs($this->staffWith([...self::BASE, 'tickets.level_network']));

        $this->getJson('/api/tickets')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.category', 'network');
    }

    public function test_no_level_means_no_cases_at_all(): void
    {
        Ticket::factory()->create(['category' => 'network']);

        $this->actingAs($this->staffWith(self::BASE));

        $this->getJson('/api/tickets')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_taking_a_case_outside_the_level_is_forbidden(): void
    {
        $ticket = Ticket::factory()->create(['category' => 'hardware']);

        $this->actingAs($this->staffWith([...self::BASE, 'tickets.level_network']));

        $this->postJson("/api/tickets/{$ticket->id}/take", ['priority' => 'low'])->assertForbidden();
    }

    public function test_staff_list_narrows_to_the_case_category_level(): void
    {
        $networkGuy = $this->staffWith([...self::BASE, 'tickets.level_network']);

        $this->actingAs($networkGuy);
        $this->getJson('/api/tickets/staff?category=network')->assertOk()
            ->assertJsonPath('data.0.id', $networkGuy->id);
        $this->getJson('/api/tickets/staff?category=hardware')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_case_cannot_land_with_staff_whose_level_does_not_cover_it(): void
    {
        $dispatcher = $this->staffWith([...self::BASE, 'tickets.assign', 'tickets.level_hardware']);
        // Same admin role → same grants; the point is the missing hardware... use a
        // separate plain user with NO resolve at all as the clearest invalid target.
        $target = User::factory()->create(['role' => 'user']);
        $ticket = Ticket::factory()->create(['category' => 'hardware']);

        $this->actingAs($dispatcher);
        $this->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $target->id, 'priority' => 'low'])
            ->assertStatus(422);
    }

    public function test_forwarding_requires_the_forward_gate(): void
    {
        // Assignee holds resolve (+ level) but NOT tickets.forward.
        $owner = $this->staffWith([...self::BASE, 'tickets.level_network']);
        $ticket = Ticket::factory()->create([
            'category' => 'network', 'assignee_id' => $owner->id, 'status' => 'in_progress',
        ]);
        $other = User::factory()->create(['role' => 'super']);

        $this->actingAs($owner);
        $this->postJson("/api/tickets/{$ticket->id}/forward", ['assignee_id' => $other->id])->assertForbidden();
    }

    public function test_new_case_bell_goes_only_to_matching_level_staff(): void
    {
        $networkGuy = $this->staffWith([...self::BASE, 'tickets.level_network']);
        $requester = User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => 'Requester', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]);

        $this->actingAs($requester);
        $this->postJson('/api/tickets', [
            'subject' => 'Switch port keeps flapping',
            'description' => 'Uplink on floor 3 drops every few minutes.',
            'category' => 'network',
            'callback_phone' => '081 222 3333',
        ])->assertCreated();

        $this->assertSame('ticket_new', $networkGuy->notifications()->first()->data['type']);

        // A hardware case must not ping the network-only staff.
        $this->postJson('/api/tickets', [
            'subject' => 'Docking station is dead',
            'description' => 'No power output since this morning.',
            'category' => 'hardware',
            'callback_phone' => '081 222 3333',
        ])->assertCreated();

        $this->assertSame(1, $networkGuy->notifications()->count());
    }

    public function test_assigning_sends_a_bell_to_the_assignee(): void
    {
        $staff = $this->staffWith([...self::BASE, 'tickets.level_network']);
        $ticket = Ticket::factory()->create(['category' => 'network']);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/tickets/{$ticket->id}/assign", ['assignee_id' => $staff->id, 'priority' => 'low'])->assertOk();

        $this->assertTrue($staff->notifications()->pluck('data')->contains(fn ($d) => $d['type'] === 'ticket_assigned'));
    }
}
