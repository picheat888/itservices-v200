<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(string $sku, int $stock, string $wh = 'Main'): StockItem
    {
        return StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'warehouse' => $wh]);
    }

    public function test_open_snapshots_a_line_per_matching_item(): void
    {
        $this->item('A-1', 10, 'Main');
        $this->item('B-1', 5, 'Other');
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonCount(1, 'data.lines')
            ->assertJsonPath('data.lines.0.system_qty', 10);
    }

    public function test_save_counts_then_commit_adjusts_stock_and_logs_movement(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 7]])
            ->assertOk()
            ->assertJsonPath('data.lines.0.variance', -3);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'committed');

        $this->assertSame(7, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3]);
    }

    public function test_counted_up_records_adjust_up(): void
    {
        $item = $this->item('A-1', 4);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 9]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(9, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_up', 'qty' => 5]);
    }

    public function test_uncounted_lines_are_untouched_and_recommit_blocked(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422);
    }

    public function test_requires_stock_audit_permission(): void
    {
        $this->item('A-1', 10);
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertForbidden();

        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'stock.audit', 'allowed' => true]);
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertCreated();
    }
}
