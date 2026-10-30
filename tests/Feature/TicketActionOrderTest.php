<?php

// Ticket actions refuse on permission and case state before they look at the fields sent.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TicketActionOrderTest extends TestCase
{
    use RefreshDatabase;

    private function userWithEmployee(string $role = 'super'): User
    {
        $employee = Employee::create(['first_name' => 'Order', 'last_name' => 'Test', 'status' => 'active']);

        return User::factory()->create(['role' => $role, 'employee_id' => $employee->id]);
    }

    public function test_a_user_without_the_key_is_refused_before_an_empty_body_is_validated(): void
    {
        $open = Ticket::factory()->create();
        $working = Ticket::factory()->create(['assignee_id' => $this->userWithEmployee()->id, 'status' => 'in_progress']);
        $this->actingAs($this->userWithEmployee('user'));

        $this->postJson("/api/tickets/{$open->id}/take", [])->assertForbidden();
        $this->postJson("/api/tickets/{$open->id}/assign", [])->assertForbidden();
        $this->postJson("/api/tickets/{$working->id}/forward", [])->assertForbidden();
        $this->postJson("/api/tickets/{$working->id}/resolve", [])->assertForbidden();
        $this->postJson("/api/tickets/{$working->id}/updates", [])->assertForbidden();
        $this->getJson('/api/tickets/summary?from=bad')->assertForbidden()->assertJsonPath('message', '');
        $this->getJson('/api/tickets?requested=1')->assertForbidden()->assertJsonPath('message', '');
    }

    public function test_case_state_refusals_keep_their_codes_with_an_empty_body(): void
    {
        $staff = $this->userWithEmployee();
        $this->actingAs($staff);

        $taken = Ticket::factory()->create(['assignee_id' => $this->userWithEmployee()->id, 'status' => 'in_progress']);
        $this->postJson("/api/tickets/{$taken->id}/take", [])->assertStatus(422)->assertJsonPath('message', 'not_open_for_taking');
        $this->postJson("/api/tickets/{$taken->id}/assign", [])->assertStatus(422)->assertJsonPath('message', 'not_open');
        $this->postJson("/api/tickets/{$taken->id}/resolve", [])->assertForbidden()->assertJsonPath('message', 'not_assignee');

        $own = Ticket::factory()->create(['requester_id' => $staff->employee_id]);
        $this->postJson("/api/tickets/{$own->id}/take", [])->assertStatus(422)->assertJsonPath('message', 'own_case');
        $this->postJson("/api/tickets/{$own->id}/assign", [])->assertForbidden()->assertJsonPath('message', 'requester_cannot_route');

        $open = Ticket::factory()->create();
        $this->postJson("/api/tickets/{$open->id}/forward", [])->assertStatus(422)->assertJsonPath('message', 'not_in_progress');
    }

    public function test_the_fields_are_checked_once_the_action_is_allowed(): void
    {
        $staff = $this->userWithEmployee();
        $this->actingAs($staff);
        $open = Ticket::factory()->create();
        $mine = Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);

        $this->postJson("/api/tickets/{$open->id}/take", [])->assertJsonValidationErrors(['priority']);
        $this->postJson("/api/tickets/{$open->id}/assign", [])->assertJsonValidationErrors(['assignee_id', 'priority']);
        $this->postJson("/api/tickets/{$mine->id}/forward", ['assignee_id' => $staff->id])->assertJsonValidationErrors(['assignee_id']);
        $this->postJson("/api/tickets/{$mine->id}/resolve", [])->assertJsonValidationErrors(['mode', 'resolution']);
        $this->postJson("/api/tickets/{$mine->id}/updates", ['body' => 'ok'])->assertJsonValidationErrors(['body']);
    }

    public function test_the_guard_answers_without_throwing_so_jobs_and_commands_can_ask_it(): void
    {
        $staff = $this->userWithEmployee();
        $own = Ticket::factory()->create(['requester_id' => $staff->employee_id]);
        $open = Ticket::factory()->create();
        $guard = app(TicketActionGuard::class);

        $refused = $guard->canTake($staff, $own);
        $this->assertTrue($refused->denied());
        $this->assertSame('own_case', $refused->message());
        $this->assertSame(422, $refused->status());

        $this->assertTrue($guard->canTake($staff, $open)->allowed());
        $this->assertTrue($guard->canView($this->userWithEmployee('user'), $open)->denied());
    }

    public function test_someone_elses_ticket_stays_closed_to_a_plain_user(): void
    {
        $ticket = Ticket::factory()->create();
        $this->actingAs($this->userWithEmployee('user'));

        $this->getJson("/api/tickets/{$ticket->id}")->assertForbidden()->assertJsonPath('message', '');
    }

    public function test_the_tab_badges_take_one_query_and_keep_their_numbers(): void
    {
        $staff = $this->userWithEmployee();
        Ticket::factory()->count(3)->create();
        Ticket::factory()->create(['assignee_id' => $staff->id, 'status' => 'in_progress']);
        Ticket::factory()->count(2)->create(['requester_id' => $staff->employee_id]);
        Ticket::factory()->create(['requester_id' => $staff->employee_id, 'status' => 'completed']);
        $this->actingAs($staff);

        $badgeQueries = 0;
        DB::listen(function ($query) use (&$badgeQueries): void {
            $badgeQueries += str_contains($query->sql, 'my_jobs_count') ? 1 : 0;
        });

        $this->getJson('/api/tickets')->assertOk()
            ->assertJsonPath('meta.open_count', 5)
            ->assertJsonPath('meta.my_jobs_count', 1)
            ->assertJsonPath('meta.my_tickets_count', 2);
        $this->assertSame(1, $badgeQueries);
    }

    public function test_a_custom_summary_range_is_validated_as_before(): void
    {
        $this->actingAs($this->userWithEmployee());

        $this->getJson('/api/tickets/summary?from=2026-01-05')->assertJsonValidationErrors(['to']);
        $this->getJson('/api/tickets/summary?from=2026-01-09&to=2026-01-05')->assertJsonValidationErrors(['to']);
        $this->getJson('/api/tickets/summary?from=2025-01-01&to=2026-12-31')
            ->assertStatus(422)
            ->assertJsonPath('message', 'range_too_long')
            ->assertJsonPath('errors.to.0', 'range_too_long');
        $this->getJson('/api/tickets/summary?days=90')->assertOk()->assertJsonPath('range_days', 90);
    }
}
