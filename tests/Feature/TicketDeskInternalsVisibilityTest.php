<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Who is shown the desk's own view of a case: its priority and its SLA clocks.
 *
 * Priority orders the queue; the clocks measure the team against its targets. A requester chose
 * neither and can act on neither — "overdue by 27 days" in red on your own ticket is the desk's
 * report card, not an answer. Both are behind the Take Case gate (tickets.resolve), and both are
 * left OUT OF THE PAYLOAD rather than hidden on screen: what never reaches the browser cannot be
 * read out of the network tab either.
 */
class TicketDeskInternalsVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /** A login account with an employee record and exactly the permissions given. */
    private function user(array $permissions = []): User
    {
        $employee = Employee::create(['first_name' => 'Some', 'last_name' => 'One', 'status' => 'active']);
        $user = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => $key], ['allowed' => true]);
        }

        return $user->refresh();
    }

    public function test_a_requester_is_not_sent_the_priority_of_their_own_case(): void
    {
        $me = $this->user(['tickets.my']);
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'priority' => 'critical']);
        $this->actingAs($me);

        $this->getJson("/api/tickets/{$ticket->id}")->assertOk()->assertJsonMissingPath('data.priority');
        $this->getJson('/api/tickets')->assertOk()->assertJsonMissingPath('data.0.priority');
    }

    public function test_a_requester_is_not_sent_the_sla_clocks_either(): void
    {
        $me = $this->user(['tickets.my']);
        $ticket = Ticket::factory()->create(['requester_id' => $me->employee_id, 'sla_resolve_due_at' => now()->subDay()]);
        $this->actingAs($me);

        $this->getJson("/api/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.sla')
            // The line naming which rule set the deadline goes with it.
            ->assertJsonMissingPath('data.sla_target');
        $this->getJson('/api/tickets')->assertOk()->assertJsonMissingPath('data.0.sla');
    }

    public function test_whoever_can_take_a_case_is_sent_both(): void
    {
        $staff = $this->user(['tickets.resolve', 'tickets.view_all', 'tickets.level_hardware']);
        Ticket::factory()->create(['category' => 'hardware', 'priority' => 'critical']);
        $this->actingAs($staff);

        $this->getJson('/api/tickets')
            ->assertOk()
            ->assertJsonPath('data.0.priority', 'critical')
            ->assertJsonPath('data.0.sla.state', fn ($state) => is_string($state));
    }

    public function test_the_priority_filter_is_ignored_for_a_requester(): void
    {
        $me = $this->user(['tickets.my']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'priority' => 'critical']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'priority' => 'low']);
        $this->actingAs($me);

        // Filtering by something you are not shown would leak it one request at a time.
        $this->getJson('/api/tickets?priority=critical')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_the_overdue_filter_is_ignored_for_a_requester(): void
    {
        $me = $this->user(['tickets.my']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open', 'sla_response_due_at' => now()->subDay()]);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open', 'sla_response_due_at' => now()->addDay()]);
        $this->actingAs($me);

        $this->getJson('/api/tickets?sla=breached')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_sorting_by_priority_falls_back_for_a_requester(): void
    {
        $me = $this->user(['tickets.my']);
        // Same category so the staff half below is not narrowed by Ticket Level scoping.
        $critical = Ticket::factory()->create(['requester_id' => $me->employee_id, 'category' => 'hardware', 'priority' => 'critical']);
        $low = Ticket::factory()->create(['requester_id' => $me->employee_id, 'category' => 'hardware', 'priority' => 'low']);
        $this->actingAs($me);

        // Newest first, the default — not the critical one hoisted to the top.
        $this->getJson('/api/tickets?sort=priority_desc')
            ->assertOk()
            ->assertJsonPath('data.0.id', $low->id)
            ->assertJsonPath('data.1.id', $critical->id);

        $staff = $this->user(['tickets.resolve', 'tickets.view_all', 'tickets.level_hardware']);
        $this->actingAs($staff);
        $this->getJson('/api/tickets?sort=priority_desc')->assertOk()->assertJsonPath('data.0.priority', 'critical');
    }

    public function test_sorting_by_sla_falls_back_for_a_requester(): void
    {
        $me = $this->user(['tickets.my']);
        $later = Ticket::factory()->create([
            'requester_id' => $me->employee_id, 'status' => 'open', 'sla_response_due_at' => now()->addDays(9),
        ]);
        $soonest = Ticket::factory()->create([
            'requester_id' => $me->employee_id, 'status' => 'open', 'sla_response_due_at' => now()->addHour(),
        ]);

        $this->actingAs($me)
            ->getJson('/api/tickets?sort=sla_due')
            ->assertOk()
            // Newest first, not the most urgent deadline first.
            ->assertJsonPath('data.0.id', $soonest->id)
            ->assertJsonPath('data.1.id', $later->id);
    }

    public function test_an_assets_repair_list_follows_the_same_rule(): void
    {
        $viewer = $this->user(['assets.view']);
        $asset = Asset::factory()->create();
        Ticket::factory()->create(['related_asset_id' => $asset->id, 'priority' => 'critical']);
        $this->actingAs($viewer);

        // Somebody reading an asset record is not thereby dispatching cases.
        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.tickets.0.priority', null);
    }
}
