<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

// The Ticket overview must read only the tickets its windows and backlog need, not the whole table
class TicketSummaryLoadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        $this->travelTo('2026-01-14 12:00:00');
    }

    private function loadedTickets(string $url): int
    {
        $loaded = 0;
        Event::listen('eloquent.retrieved: '.Ticket::class, function () use (&$loaded): void {
            $loaded++;
        });
        $this->getJson($url)->assertOk();

        return $loaded;
    }

    public function test_default_window_does_not_load_old_closed_tickets(): void
    {
        $this->actingAs(User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => 'Boss', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]));

        // Forty closed a year ago, which no 30-day window or backlog figure needs
        for ($i = 0; $i < 40; $i++) {
            Ticket::factory()->create(['status' => 'completed', 'created_at' => '2025-01-06 09:00:00', 'responded_at' => '2025-01-06 10:00:00', 'resolved_at' => '2025-01-06 15:00:00']);
        }
        Ticket::factory()->create(['status' => 'completed', 'created_at' => '2026-01-12 09:00:00', 'resolved_at' => '2026-01-12 11:00:00']);
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2025-11-01 09:00:00']);

        // Only the recent and the still-open ones, never the forty old ones
        $this->assertLessThan(10, $this->loadedTickets('/api/tickets/summary'));
        // The whole-history view still needs everything
        $this->assertGreaterThanOrEqual(42, $this->loadedTickets('/api/tickets/summary?days=all'));
    }

    public function test_window_edges_count_the_way_carbon_comparisons_do(): void
    {
        $this->actingAs(User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['first_name' => 'Boss', 'last_name' => 'Test', 'status' => 'active'])->id,
        ]));

        // now = 2026-01-14 12:00:00; 7-day window = 01-07 12:00:00 .. 01-14 12:00:00, previous = 12-31 12:00:00 .. 01-07 12:00:00
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-07 12:00:00']);
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-14 12:00:00']);
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2025-12-31 12:00:00']);
        Ticket::factory()->create(['status' => 'open', 'created_at' => '2026-01-07 11:59:59']);
        // Closed exactly on the shared edge: counted by both windows
        Ticket::factory()->create(['status' => 'completed', 'created_at' => '2026-01-05 09:00:00', 'resolved_at' => '2026-01-07 12:00:00']);

        $this->getJson('/api/tickets/summary?days=7')
            ->assertOk()
            ->assertJsonPath('created', 2)
            ->assertJsonPath('created_delta_count', -1)
            ->assertJsonPath('resolved', 1)
            ->assertJsonPath('resolved_delta_count', 0)
            ->assertJsonPath('backlog', 4);
    }
}
