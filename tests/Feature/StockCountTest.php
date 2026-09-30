<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
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
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100]);
        // Warehouse scoping is balance-based now โ€” park the stock in the given warehouse.
        $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => $wh])->id, 'qty' => $stock]);

        return $item;
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

    /**
     * A count of one warehouse is a count of that shelf: it snapshots that warehouse's
     * balance, and committing it moves that balance and the total by the difference. It
     * used to snapshot the item's total and overwrite the total with one shelf's count,
     * leaving every warehouse balance untouched.
     */
    public function test_a_one_warehouse_count_adjusts_that_warehouse_and_the_total_by_the_difference(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch'])->id, 'qty' => 5]);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])->assertCreated()->json('data');
        $this->assertSame(10, $count['lines'][0]['system_qty']);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 7]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $balances = $item->fresh()->balances()->with('warehouse')->get()->mapWithKeys(fn ($b) => [$b->warehouse->name => $b->qty]);
        $this->assertSame(['Main' => 7, 'Branch' => 5], $balances->sortKeys()->reverse()->all());
        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3, 'from_label' => 'Main']);
    }

    public function test_an_all_warehouse_count_adjusts_the_only_warehouse_an_item_sits_in(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 12]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertSame(12, (int) $item->fresh()->balances()->sum('qty'));
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_up', 'qty' => 2, 'to_label' => 'Main']);
    }

    /** Across several warehouses the difference has no one place to go — count it per warehouse. */
    public function test_an_all_warehouse_count_refuses_an_item_spread_over_warehouses(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch'])->id, 'qty' => 5]);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 14]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'count_needs_warehouse')
            ->assertJsonPath('sku', 'A-1');

        // Nothing moved, and the draft stays open to be redone per warehouse.
        $this->assertSame(15, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::where('stock_item_id', $item->id)->count());
        $this->getJson("/api/stock-counts/{$count['id']}")->assertJsonPath('data.status', 'draft');
    }

    public function test_open_with_explicit_sku_ids_snapshots_only_those_items(): void
    {
        $a = $this->item('A-1', 10, 'Main');
        $this->item('B-1', 5, 'Main');
        $c = $this->item('C-1', 3, 'Main');
        $this->actingAs($this->super());

        // Pick only A-1 and C-1 โ€” warehouse has 3 items but we count 2.
        $this->postJson('/api/stock-counts', ['warehouse' => 'Main', 'stock_item_ids' => [$a->id, $c->id]])
            ->assertCreated()
            ->assertJsonCount(2, 'data.lines');
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

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422)->assertJsonPath('message', 'count_closed');
    }

    public function test_manual_commit_is_report_only(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 4]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])
            ->assertOk()
            ->assertJsonPath('data.status', 'committed')
            ->assertJsonPath('data.adjust_mode', 'manual');

        // Report only: stock untouched, no movements recorded.
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_auto_commit_persists_mode_and_adjusts(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 7]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'auto'])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(7, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3]);
    }

    public function test_commit_without_mode_defaults_to_auto(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 8]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(8, $item->fresh()->current_stock);
    }

    public function test_reference_auto_numbers_per_year(): void
    {
        $this->item('A-1', 5);
        $this->actingAs($this->super());
        $year = now()->year;

        $first = $this->postJson('/api/stock-counts', [])->assertCreated()->json('data.reference');
        $second = $this->postJson('/api/stock-counts', [])->assertCreated()->json('data.reference');

        $this->assertSame("SC-{$year}-001", $first);
        $this->assertSame("SC-{$year}-002", $second);
    }

    public function test_requires_stock_count_permission(): void
    {
        $this->item('A-1', 10);
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertForbidden();

        foreach (['stock.module', 'stock.view_count'] as $p) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $p, 'allowed' => true]);
        }
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertCreated();
    }
}
