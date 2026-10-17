<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Ticket overview windows: this year, and a custom range of at most 365 days
class TicketSummaryRangeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        $this->travelTo('2026-10-17 12:00:00');
        $this->actingAs(User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => 'Boss', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]));
    }

    public function test_this_year_counts_from_the_first_of_january(): void
    {
        Ticket::factory()->create(['created_at' => '2025-12-31 10:00:00']);
        Ticket::factory()->create(['created_at' => '2026-01-02 10:00:00']);
        Ticket::factory()->create(['created_at' => '2026-10-01 10:00:00']);

        $this->getJson('/api/tickets/summary?days=year')->assertOk()
            ->assertJsonPath('created', 2)
            ->assertJsonPath('range_days', 290);
    }

    public function test_a_custom_range_of_365_days_is_accepted(): void
    {
        $this->getJson('/api/tickets/summary?from=2025-10-18&to=2026-10-17')->assertOk()
            ->assertJsonPath('range_days', 365);
    }

    public function test_a_custom_range_over_365_days_is_refused_with_a_message_on_to(): void
    {
        $this->getJson('/api/tickets/summary?from=2025-10-17&to=2026-10-17')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to']);
    }

    public function test_the_default_window_is_still_30_days(): void
    {
        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('range_days', 30);
    }
}
