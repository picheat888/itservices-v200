<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketSlaTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create([
            'role' => 'super',
            'employee_id' => Employee::create(['name' => 'Boss', 'status' => 'active'])->id,
        ]);
    }

    public function test_sla_met_pct_uses_priority_resolution_targets(): void
    {
        $this->actingAs($this->super());

        // Critical target = 4h. Closed in 2h → met; closed in 7h → missed.
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => now()->subHours(10), 'resolved_at' => now()->subHours(8),
        ]);
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => now()->subHours(10), 'resolved_at' => now()->subHours(3),
        ]);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('sla_met_pct', 50);
    }

    public function test_sla_target_is_configurable_in_settings(): void
    {
        $this->actingAs($this->super());

        // Tighten critical resolution to 1h, then a 2h close should now miss.
        AppSetting::put('ticket_sla', json_encode(['critical' => ['response' => 15, 'resolve' => 1]]));
        Ticket::factory()->create([
            'priority' => 'critical', 'status' => 'completed',
            'created_at' => now()->subHours(5), 'resolved_at' => now()->subHours(3),
        ]);

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('sla_met_pct', 0);
    }

    public function test_avg_response_minutes_is_computed(): void
    {
        $this->actingAs($this->super());

        Ticket::factory()->create(['created_at' => now()->subMinutes(100), 'responded_at' => now()->subMinutes(70)]); // 30m
        Ticket::factory()->create(['created_at' => now()->subMinutes(100), 'responded_at' => now()->subMinutes(10)]); // 90m

        $this->getJson('/api/tickets/summary')->assertOk()->assertJsonPath('avg_response_minutes', 60);
    }

    public function test_metrics_are_null_without_data(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/tickets/summary')->assertOk()
            ->assertJsonPath('sla_met_pct', null)
            ->assertJsonPath('avg_response_minutes', null);
    }

    public function test_settings_expose_and_persist_sla_targets(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/settings')->assertOk()->assertJsonPath('data.ticket_sla.critical.resolve', 4);

        $this->putJson('/api/settings', ['ticket_sla' => [
            'critical' => ['response' => 10, 'resolve' => 2],
            'high' => ['response' => 30, 'resolve' => 8],
            'medium' => ['response' => 120, 'resolve' => 24],
            'low' => ['response' => 240, 'resolve' => 72],
        ]])->assertOk()->assertJsonPath('data.ticket_sla.critical.resolve', 2);
    }
}
