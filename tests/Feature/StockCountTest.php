<?php

namespace Tests\Feature;

use App\Enums\Stock\StockCountStatus;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockNotificationService;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Mockery;
use Tests\Concerns\AssertsLotLedger;
use Tests\Concerns\ParksStockOnLots;
use Tests\TestCase;

class StockCountTest extends TestCase
{
    use AssertsLotLedger;
    use ParksStockOnLots;
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(string $sku, int $stock, string $wh = 'Main'): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100]);
        $this->parkStock($item, Warehouse::firstOrCreate(['name' => $wh])->id, $stock);

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
        $this->putJson("/api/stock-counts/{$id}", ['lines' => [$lineId => ['counted_qty' => 3]]])->assertOk();

        $this->getJson('/api/stock-counts')->assertOk()
            ->assertJsonMissingPath('data.0.lines')
            ->assertJsonPath('data.0.line_count', 2)
            ->assertJsonPath('data.0.counted_lines', 1)
            ->assertJsonPath('data.0.differing_lines', 1);
        $this->getJson("/api/stock-counts/{$id}")->assertJsonCount(2, 'data.lines')->assertJsonPath('data.differing_lines', 1);
    }

    public function test_differing_lines_leave_out_lines_counted_as_the_system_says(): void
    {
        $a = $this->item('A-1', 10);
        $b = $this->item('A-2', 5);
        $this->actingAs($this->super());
        $id = $this->open($this->warehouse(), [$a->id, $b->id])['id'];
        $lines = collect($this->getJson("/api/stock-counts/{$id}")->json('data.lines'));
        $counts = $lines->mapWithKeys(fn ($l) => [$l['id'] => ['counted_qty' => $l['system_qty']]])->all();
        $this->putJson("/api/stock-counts/{$id}", ['lines' => $counts])->assertOk();

        $this->getJson('/api/stock-counts')->assertJsonPath('data.0.counted_lines', 2)->assertJsonPath('data.0.differing_lines', 0);
    }

    // One-warehouse count: snapshots and adjusts that warehouse's balance, and the total by the difference
    public function test_a_one_warehouse_count_adjusts_that_warehouse_and_the_total_by_the_difference(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->parkStock($item, Warehouse::firstOrCreate(['name' => 'Branch'])->id, 5);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse(), [$item->id]);
        $this->assertSame(10, $count['lines'][0]['system_qty']);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 7, 'reason' => 'lost']]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $balances = $item->fresh()->balances()->with('warehouse')->get()->mapWithKeys(fn ($b) => [$b->warehouse->name => $b->qty]);
        $this->assertSame(['Main' => 7, 'Branch' => 5], $balances->sortKeys()->reverse()->all());
        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3, 'from_label' => 'Main']);
        $this->assertLotsMatchBalances($item->fresh());
        $this->assertLotsMatchEntries($item);
    }

    public function test_a_count_of_a_warehouse_adjusts_an_item_that_sits_only_there(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse(), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 12, 'reason' => 'inbound']]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(12, $item->fresh()->current_stock);
        $this->assertSame(12, (int) $item->fresh()->balances()->sum('qty'));
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_up', 'qty' => 2, 'to_label' => 'Main']);
    }

    // An item spread over warehouses: counting one leaves the other balance alone
    public function test_a_count_of_one_warehouse_leaves_the_other_warehouse_balance_alone(): void
    {
        $item = $this->item('A-1', 10, 'Main');
        $this->parkStock($item, $this->warehouse('Branch')->id, 5);
        $item->update(['current_stock' => 15]);
        $this->actingAs($this->super());

        $count = $this->open($this->warehouse('Branch'), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 4, 'reason' => 'lost']]])->assertOk();
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
        $this->parkStock($both, $this->warehouse('Other')->id, 5);
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

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 7, 'reason' => 'lost']]])
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
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 9, 'reason' => 'inbound']]])->assertOk();
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
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 7, 'reason' => 'lost']]])->assertOk();

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
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 7, 'reason' => 'lost']]])->assertOk();

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

    public function test_save_rechecks_draft_status_under_lock(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        $this->saveLine($countId, $lineId, ['counted_qty' => 7])->assertOk();

        // A concurrent commit closes the count the moment this save's transaction begins.
        $fired = false;
        Event::listen(TransactionBeginning::class, function () use (&$fired, $countId) {
            if (! $fired) {
                $fired = true;
                DB::table('stock_counts')->where('id', $countId)->update(['status' => 'committed']);
            }
        });

        $this->saveLine($countId, $lineId, ['counted_qty' => 3, 'reason' => 'lost'])->assertStatus(422);

        $line = DB::table('stock_count_lines')->where('id', $lineId)->first();
        $this->assertSame(7, (int) $line->counted_qty);
        $this->assertNull($line->reason);
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

    public function test_commit_refuses_a_mode_key(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 4, 'reason' => 'lost']]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])
            ->assertUnprocessable()->assertJsonValidationErrors(['mode']);

        $this->assertSame('draft', StockCount::find($count['id'])->status->value);
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_commit_refuses_mode_auto_too(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 7, 'reason' => 'lost']]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'auto'])
            ->assertUnprocessable()->assertJsonValidationErrors(['mode']);

        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_commit_stores_auto(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 8, 'reason' => 'used']]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(8, $item->fresh()->current_stock);
    }

    public function test_commit_refuses_a_difference_without_reason(): void
    {
        $match = $this->item('A-1', 5);
        $short = $this->item('B-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$match->id, $short->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [
            $count['lines'][0]['id'] => ['counted_qty' => 5],
            $count['lines'][1]['id'] => ['counted_qty' => 7],
        ]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_missing')->assertJsonPath('sku', 'B-1');

        // A custom reason whose note went missing is refused the same way
        StockCountLine::whereKey($count['lines'][1]['id'])->update(['reason' => 'custom', 'reason_note' => null]);
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_missing')->assertJsonPath('sku', 'B-1');

        $this->assertSame('draft', StockCount::find($count['id'])->status->value);
        $this->assertSame(0, StockMovement::count());
        $this->assertSame(10, $short->fresh()->current_stock);
    }

    public function test_commit_books_doc_no_reason_and_notes(): void
    {
        $short = $this->item('A-1', 10);
        $over = $this->item('B-1', 4);
        $user = $this->super();
        $this->actingAs($user);
        $count = $this->open($this->warehouse(), [$short->id, $over->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [
            $count['lines'][0]['id'] => ['counted_qty' => 8, 'reason' => 'used'],
            $count['lines'][1]['id'] => ['counted_qty' => 5, 'reason' => 'custom', 'reason_note' => 'พบหลังตู้'],
        ]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk()->assertJsonPath('data.adjust_mode', 'auto');

        $year = now()->year;
        $mainId = $this->warehouse()->id;
        $down = StockMovement::where('stock_item_id', $short->id)->sole();
        $this->assertSame(["ADJ-{$year}-001", 'adjust_down', 2, 'used', null, $count['reference'], 'Main', $mainId], [
            $down->doc_no, $down->type, $down->qty, $down->reason, $down->notes, $down->reference, $down->from_label, $down->from_warehouse_id,
        ]);
        $up = StockMovement::where('stock_item_id', $over->id)->sole();
        $this->assertSame(["ADJ-{$year}-002", 'adjust_up', 1, 'custom', 'พบหลังตู้', 'Main', $mainId], [
            $up->doc_no, $up->type, $up->qty, $up->reason, $up->notes, $up->to_label, $up->to_warehouse_id,
        ]);

        $this->assertSame(8, $short->fresh()->current_stock);
        $this->assertSame(8, (int) $short->balances()->where('warehouse_id', $mainId)->value('qty'));
        $this->assertSame(5, $over->fresh()->current_stock);
        $this->assertSame(5, (int) $over->balances()->where('warehouse_id', $mainId)->value('qty'));

        $stored = StockCount::find($count['id']);
        $this->assertSame($user->id, $stored->committed_by);
        $this->assertSame('auto', $stored->adjust_mode->value);
        $this->assertDatabaseHas('audit_logs', ['action' => 'Committed stock count', 'target' => "{$count['reference']} (2 items adjusted)"]);
    }

    // STK-6: a warehouse renamed while the draft is open still takes the difference
    public function test_commit_after_warehouse_rename_books_the_same_warehouse(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $main = $this->warehouse();
        $count = $this->open($main, [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 6, 'reason' => 'lost']]])->assertOk();
        $main->update(['name' => 'Main 2']);
        $warehouses = Warehouse::count();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame($warehouses, Warehouse::count());
        $this->assertSame(6, (int) $item->balances()->where('warehouse_id', $main->id)->value('qty'));
        $this->assertSame(1, $item->balances()->count());
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'from_label' => 'Main 2', 'from_warehouse_id' => $main->id]);
    }

    public function test_commit_without_warehouse_is_refused(): void
    {
        $item = $this->item('A-1', 10);
        $user = $this->super();
        $this->actingAs($user);
        $count = StockCount::create(['status' => StockCountStatus::Draft, 'counted_by' => $user->id]);
        $count->lines()->create(['stock_item_id' => $item->id, 'system_qty' => 10, 'counted_qty' => 8, 'reason' => 'lost']);
        $this->assertNull($count->fresh()->warehouse_id);

        $this->postJson("/api/stock-counts/{$count->id}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_needs_warehouse')->assertJsonMissingPath('sku');

        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    // STK-12: only the items whose stock changed are re-checked for alerts
    public function test_alerts_only_for_changed_items(): void
    {
        $match = $this->item('A-1', 5);
        $short = $this->item('B-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$match->id, $short->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [
            $count['lines'][0]['id'] => ['counted_qty' => 5],
            $count['lines'][1]['id'] => ['counted_qty' => 7, 'reason' => 'lost'],
        ]])->assertOk();
        $alerts = $this->spy(StockNotificationService::class);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $alerts->shouldHaveReceived('alert')->once();
        $alerts->shouldHaveReceived('alert')->with(Mockery::on(fn (StockItem $item) => $item->id === $short->id && $item->current_stock === 7));
    }

    public function test_all_matching_rows_still_commit(): void
    {
        $a = $this->item('A-1', 10);
        $b = $this->item('B-1', 3);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$a->id, $b->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [
            $count['lines'][0]['id'] => ['counted_qty' => 10],
            $count['lines'][1]['id'] => ['counted_qty' => 3],
        ]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk()->assertJsonPath('data.status', 'committed');

        $this->assertSame(0, StockMovement::count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'Committed stock count', 'target' => "{$count['reference']} (0 items adjusted)"]);
    }

    public function test_second_commit_is_refused(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 9, 'reason' => 'broken']]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        $movements = StockMovement::count();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422)->assertJsonPath('message', 'count_closed');

        $this->assertSame($movements, StockMovement::count());
        $this->assertSame(9, $item->fresh()->current_stock);
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

    /** Open a one-line count (system 10) and return [count id, line id]. */
    private function openOneLine(): array
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->open($this->warehouse(), [$item->id]);

        return [$count['id'], $count['lines'][0]['id']];
    }

    private function saveLine(int $countId, int $lineId, array $payload)
    {
        return $this->putJson("/api/stock-counts/{$countId}", ['lines' => [$lineId => $payload]]);
    }

    public function test_save_stores_qty_reason_and_note(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'used', 'reason_note' => 'sent to HR'])->assertOk();

        $this->getJson("/api/stock-counts/{$countId}")
            ->assertJsonPath('data.lines.0.counted_qty', 7)
            ->assertJsonPath('data.lines.0.reason', 'used')
            ->assertJsonPath('data.lines.0.reason_note', 'sent to HR')
            ->assertJsonPath('data.lines.0.found_serial_ids', []);
    }

    public function test_save_refuses_a_reason_from_the_wrong_side(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 12, 'reason' => 'lost'])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_wrong_side')->assertJsonPath('sku', 'A-1');
    }

    public function test_save_refuses_a_reason_on_a_line_with_no_difference(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 10, 'reason' => 'miscount'])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_wrong_side');
    }

    public function test_custom_needs_a_note(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'custom'])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_note_missing')->assertJsonPath('sku', 'A-1');
        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'custom', 'reason_note' => 'water damage'])->assertOk();
    }

    public function test_leaving_custom_drops_its_note(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'custom', 'reason_note' => 'water damage'])->assertOk();

        $this->saveLine($countId, $lineId, ['reason' => 'lost'])->assertOk();

        $this->getJson("/api/stock-counts/{$countId}")
            ->assertJsonPath('data.lines.0.reason', 'lost')
            ->assertJsonPath('data.lines.0.reason_note', null);
    }

    public function test_open_refuses_the_same_item_twice(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouse()->id, 'stock_item_ids' => [$item->id, $item->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['stock_item_ids.1']);
        $this->assertSame(0, StockCount::count());
    }

    public function test_save_allows_a_difference_without_reason(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 7])
            ->assertOk()->assertJsonPath('data.lines.0.reason', null);
    }

    public function test_counted_qty_is_capped(): void
    {
        [$countId, $lineId] = $this->openOneLine();

        $this->saveLine($countId, $lineId, ['counted_qty' => 1000001])->assertStatus(422);
        $this->saveLine($countId, $lineId, ['counted_qty' => 1000000])->assertOk();
    }

    public function test_only_the_keys_sent_change(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'lost'])->assertOk();

        $this->saveLine($countId, $lineId, ['reason_note' => 'box 3'])
            ->assertOk()
            ->assertJsonPath('data.lines.0.counted_qty', 7)
            ->assertJsonPath('data.lines.0.reason', 'lost')
            ->assertJsonPath('data.lines.0.reason_note', 'box 3');
    }

    public function test_a_stored_reason_that_stops_fitting_after_a_qty_change_is_refused(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'lost'])->assertOk();

        $this->saveLine($countId, $lineId, ['counted_qty' => 12])
            ->assertStatus(422)->assertJsonPath('message', 'count_reason_wrong_side');
        $this->saveLine($countId, $lineId, ['counted_qty' => 12, 'reason' => null])->assertOk();
    }

    public function test_clearing_the_count_clears_reason_and_note(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        $this->saveLine($countId, $lineId, ['counted_qty' => 7, 'reason' => 'custom', 'reason_note' => 'x'])->assertOk();

        $this->saveLine($countId, $lineId, ['counted_qty' => null])
            ->assertOk()
            ->assertJsonPath('data.lines.0.counted_qty', null)
            ->assertJsonPath('data.lines.0.reason', null)
            ->assertJsonPath('data.lines.0.reason_note', null);
    }

    public function test_a_committed_count_cannot_be_saved(): void
    {
        [$countId, $lineId] = $this->openOneLine();
        DB::table('stock_counts')->where('id', $countId)->update(['status' => 'committed']);

        $this->saveLine($countId, $lineId, ['counted_qty' => 7])->assertStatus(422);
    }
}
