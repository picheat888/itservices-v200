<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
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

    private function warehouse(string $name = 'Main'): Warehouse
    {
        return Warehouse::firstOrCreate(['name' => $name]);
    }

    /** Open a count of one warehouse; returns the created count payload. */
    private function open(Warehouse $warehouse, array $itemIds): array
    {
        return $this->postJson('/api/stock-counts', ['warehouse_id' => $warehouse->id, 'stock_item_ids' => $itemIds])
            ->assertCreated()->json('data');
    }

    public function test_open_snapshots_a_line_per_matching_item(): void
    {
        $a = $this->item('A-1', 10, 'Main');
        $b = $this->item('B-1', 5, 'Other');
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouse('Main')->id, 'stock_item_ids' => [$a->id, $b->id]])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonCount(2, 'data.lines')
            ->assertJsonPath('data.lines.0.system_qty', 10)
            ->assertJsonPath('data.lines.1.system_qty', 0);
    }

    public function test_show_carries_the_new_line_and_count_fields(): void
    {
        $a = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());
        $id = $this->open($this->warehouse(), [$a->id])['id'];

        $response = $this->getJson("/api/stock-counts/{$id}")->assertOk();

        $this->assertIsInt($response->json('data.warehouse_id'));
        $response->assertJsonPath('data.recount_of', null)
            ->assertJsonPath('data.committed_by', null)
            ->assertJsonPath('data.lines.0.reason', null)
            ->assertJsonPath('data.lines.0.missing_serial_ids', []);
    }

    public function test_list_reports_line_totals_without_the_lines(): void
    {
        $a = $this->item('A-1', 10);
        $b = $this->item('A-2', 5);
        $this->actingAs($this->super());
        $id = $this->open($this->warehouse(), [$a->id, $b->id])['id'];
        $lineId = $this->getJson("/api/stock-counts/{$id}")->json('data.lines.0.id');
        $this->putJson("/api/stock-counts/{$id}", ['counts' => [$lineId => 3]])->assertOk();

        $this->getJson('/api/stock-counts')->assertOk()
            ->assertJsonMissingPath('data.0.lines')
            ->assertJsonPath('data.0.line_count', 2)
            ->assertJsonPath('data.0.counted_lines', 1);
        $this->getJson("/api/stock-counts/{$id}")->assertJsonCount(2, 'data.lines');
    }

    // One-warehouse count: snapshots and adjusts that warehouse's balance, and the total by the difference
    public function test_a_one_warehouse_count_adjusts_that_warehouse_and_the_total_by_the_difference(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch'])->id, 'qty' => 5]);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse(), [$item->id]);
        $this->assertSame(10, $count['lines'][0]['system_qty']);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 7]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $balances = $item->fresh()->balances()->with('warehouse')->get()->mapWithKeys(fn ($b) => [$b->warehouse->name => $b->qty]);
        $this->assertSame(['Main' => 7, 'Branch' => 5], $balances->sortKeys()->reverse()->all());
        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3, 'from_label' => 'Main']);
    }

    public function test_a_count_of_a_warehouse_adjusts_an_item_that_sits_only_there(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse(), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 12]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertSame(12, (int) $item->fresh()->balances()->sum('qty'));
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_up', 'qty' => 2, 'to_label' => 'Main']);
    }

    // An item spread over warehouses: counting one leaves the other balance alone
    public function test_a_count_of_one_warehouse_leaves_the_other_warehouse_balance_alone(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $item->balances()->create(['warehouse_id' => $this->warehouse('Branch')->id, 'qty' => 5]);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse('Branch'), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 4]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(14, $item->fresh()->current_stock);
        $this->assertSame(10, (int) $item->fresh()->balances()->where('warehouse_id', $this->warehouse('Main')->id)->value('qty'));
        $this->assertSame(4, (int) $item->fresh()->balances()->where('warehouse_id', $this->warehouse('Branch')->id)->value('qty'));
    }

    public function test_open_requires_a_warehouse_id(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['warehouse_id']);
        $this->postJson('/api/stock-counts', ['warehouse' => 'Main', 'stock_item_ids' => [$item->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['warehouse_id']);
        $this->assertDatabaseCount('stock_counts', 0);
    }

    public function test_open_requires_at_least_one_item(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouse()->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['stock_item_ids']);
        $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouse()->id, 'stock_item_ids' => []])
            ->assertUnprocessable()->assertJsonValidationErrors(['stock_item_ids']);
    }

    // STK-21: the app models no Unassigned row, so a non-existent id and a row named Unassigned are both refused
    public function test_open_refuses_unassigned(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());
        $unassigned = Warehouse::create(['name' => 'Unassigned']);

        foreach ([999999, $unassigned->id] as $id) {
            $this->postJson('/api/stock-counts', ['warehouse_id' => $id, 'stock_item_ids' => [$item->id]])
                ->assertUnprocessable()->assertJsonValidationErrors(['warehouse_id']);
        }
        $this->assertDatabaseCount('stock_counts', 0);
    }

    public function test_system_qty_is_this_warehouse_only(): void
    {
        $both = $this->item('A-1', 10, 'Main');
        $both->balances()->create(['warehouse_id' => $this->warehouse('Other')->id, 'qty' => 5]);
        $both->update(['current_stock' => 15]);
        $elsewhere = $this->item('B-1', 7, 'Other');
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse('Main'), [$both->id, $elsewhere->id]);

        $bySku = collect($count['lines'])->mapWithKeys(fn ($l) => [$l['stock_item_id'] => $l['system_qty']]);
        $this->assertSame(10, $bySku[$both->id]);
        $this->assertSame(0, $bySku[$elsewhere->id]);
        $this->assertSame($this->warehouse('Main')->id, $count['warehouse_id']);
        $this->assertSame('Main', $count['warehouse']);
    }

    public function test_open_with_explicit_sku_ids_snapshots_only_those_items(): void
    {
        $a = $this->item('A-1', 10, 'Main');
        $this->item('B-1', 5, 'Main');
        $c = $this->item('C-1', 3, 'Main');
        $this->actingAs($this->super());

        // Pick only A-1 and C-1 โ€” warehouse has 3 items but we count 2.
        $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouse()->id, 'stock_item_ids' => [$a->id, $c->id]])
            ->assertCreated()
            ->assertJsonCount(2, 'data.lines');
    }

    public function test_save_counts_then_commit_adjusts_stock_and_logs_movement(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse(), [$item->id]);
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
        $count = $this->open($this->warehouse(), [$item->id]);
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
        $count = $this->open($this->warehouse(), [$item->id]);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422)->assertJsonPath('message', 'count_closed');
    }

    public function test_committing_twice_applies_the_adjustment_once(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 7]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422)->assertJsonPath('message', 'count_closed');

        $this->assertSame(7, $item->fresh()->current_stock);
        $this->assertSame(1, StockMovement::where('type', 'adjust_down')->where('stock_item_id', $item->id)->count());
    }

    public function test_commit_rechecks_draft_status_under_lock(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 7]])->assertOk();

        // A concurrent commit closes the count the moment this commit's transaction begins.
        $fired = false;
        Event::listen(TransactionBeginning::class, function () use (&$fired, $count) {
            if (! $fired) {
                $fired = true;
                DB::table('stock_counts')->where('id', $count['id'])->update(['status' => 'committed']);
            }
        });

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422)->assertJsonPath('message', 'count_closed');

        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_open_refuses_a_warehouse_name_and_creates_none(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse' => 'Nowhere', 'stock_item_ids' => [$item->id]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['warehouse_id']);

        $this->assertDatabaseMissing('warehouses', ['name' => 'Nowhere']);
        $this->assertDatabaseCount('stock_counts', 0);
    }

    public function test_manual_commit_is_report_only(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
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
        $count = $this->open($this->warehouse(), [$item->id]);
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
        $count = $this->open($this->warehouse(), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 8]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(8, $item->fresh()->current_stock);
    }

    public function test_reference_auto_numbers_per_year(): void
    {
        $item = $this->item('A-1', 5);
        $this->actingAs($this->super());
        $year = now()->year;

        $first = $this->open($this->warehouse(), [$item->id]);
        // Two drafts may not hold the same item, so the first closes before the second opens
        $this->deleteJson("/api/stock-counts/{$first['id']}")->assertOk();
        $second = $this->open($this->warehouse(), [$item->id])['reference'];
        $first = $first['reference'];

        $this->assertSame("SC-{$year}-001", $first);
        $this->assertSame("SC-{$year}-002", $second);
    }

    public function test_requires_stock_count_permission(): void
    {
        $item = $this->item('A-1', 10);
        $body = ['warehouse_id' => $this->warehouse()->id, 'stock_item_ids' => [$item->id]];
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-counts', $body)->assertForbidden();

        foreach (['stock.module', 'stock.view_count'] as $p) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $p, 'allowed' => true]);
        }
        $this->actingAs($user)->postJson('/api/stock-counts', $body)->assertCreated();
    }
}
