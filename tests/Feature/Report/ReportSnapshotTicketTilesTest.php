<?php

// Pins the Report Center strip's ticket tiles (open count + trend, SLA rate + change + trend) on a small dataset.

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportSnapshotTicketTilesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    private function reader(): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach (['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function completed(string $created, string $resolved, ?string $due): void
    {
        Ticket::factory()->create([
            'category' => 'hardware', 'status' => 'completed',
            'created_at' => $created, 'resolved_at' => $resolved, 'sla_resolve_due_at' => $due,
        ]);
    }

    public function test_ticket_tiles_on_a_known_dataset(): void
    {
        // This period: two met, one missed, one with no deadline (not measured).
        $this->completed('2026-09-10 10:00:00', '2026-09-11 10:00:00', '2026-09-12 10:00:00');
        $this->completed('2026-09-10 11:00:00', '2026-09-15 10:00:00', '2026-09-12 10:00:00');
        $this->completed('2026-09-24 10:00:00', '2026-09-25 08:00:00', '2026-09-26 10:00:00');
        $this->completed('2026-09-12 10:00:00', '2026-09-13 10:00:00', null);
        // The 30 days before: one met, two missed.
        $this->completed('2026-08-10 10:00:00', '2026-08-12 10:00:00', '2026-08-15 10:00:00');
        $this->completed('2026-08-10 10:00:00', '2026-08-20 10:00:00', '2026-08-15 10:00:00');
        $this->completed('2026-08-11 10:00:00', '2026-08-21 10:00:00', '2026-08-15 10:00:00');
        // Still open, raised mid-period.
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'open', 'created_at' => '2026-09-01 09:00:00']);

        $tiles = collect($this->actingAs($this->reader())->getJson('/api/reports/snapshot?period=30d')->assertOk()->json('data.tiles'))->keyBy('key');

        $sla = $tiles['sla_rate'];
        $this->assertSame(66.7, $sla['value']);
        $this->assertSame(33.4, $sla['delta']);
        $this->assertSame('percent', $sla['unit']);
        $this->assertSame([null, null, null, 50, null, null, 100], $sla['trend']);

        $open = $tiles['tickets_open'];
        $this->assertSame(1, $open['value']);
        $this->assertSame([0, 0, 1, 3, 1, 1, 1], $open['trend']);
        $this->assertEquals(1.0, $open['delta']);
    }

    public function test_sla_tile_is_null_without_measured_tickets(): void
    {
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'open', 'created_at' => '2026-09-20 09:00:00']);

        $sla = collect($this->actingAs($this->reader())->getJson('/api/reports/snapshot?period=7d')->assertOk()->json('data.tiles'))->keyBy('key')['sla_rate'];

        $this->assertNull($sla['value']);
        $this->assertNull($sla['delta']);
        $this->assertSame([null, null, null, null, null, null, null], $sla['trend']);
    }
}
