<?php

// Two draft counts never hold the same item on the same shelf, so a confirmed difference is booked once.

namespace Tests\Feature;

use App\Enums\Stock\StockCountStatus;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class StockCountOverlapTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['role' => 'super']);
        $this->actingAs($this->user);
    }

    private function item(string $sku, array $balances): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => array_sum($balances), 'min_stock' => 1, 'max_stock' => 100]);
        foreach ($balances as $warehouse => $qty) {
            $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => $warehouse])->id, 'qty' => $qty]);
        }

        return $item;
    }

    /** @param  list<int>  $itemIds */
    private function open(array $itemIds, string $warehouse): TestResponse
    {
        return $this->postJson('/api/stock-counts', ['warehouse_id' => Warehouse::firstOrCreate(['name' => $warehouse])->id, 'stock_item_ids' => $itemIds]);
    }

    public function test_a_second_count_of_the_same_item_on_the_same_shelf_is_refused_and_names_the_first(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        $first = $this->open([$item->id], 'Main')->assertCreated()->json('data');

        $this->open([$item->id], 'Main')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'count_overlap')
            ->assertJsonPath('sku', 'A-1')
            ->assertJsonPath('reference', $first['reference']);
        $this->assertSame(1, StockCount::count());
    }

    public function test_several_held_items_are_named_as_the_first_and_how_many_more(): void
    {
        $a = $this->item('A-1', ['Main' => 10]);
        $b = $this->item('B-1', ['Main' => 4]);
        $c = $this->item('C-1', ['Main' => 3]);
        $first = $this->open([$a->id, $b->id], 'Main')->assertCreated()->json('data');

        $this->open([$a->id, $b->id, $c->id], 'Main')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'count_overlap_many')
            ->assertJsonPath('sku', 'A-1')
            ->assertJsonPath('n', 1)
            ->assertJsonPath('reference', $first['reference']);
    }

    public function test_counts_of_the_same_item_on_different_shelves_may_run_together(): void
    {
        $item = $this->item('A-1', ['Main' => 10, 'Branch' => 5]);
        $this->open([$item->id], 'Main')->assertCreated();

        $this->open([$item->id], 'Branch')->assertCreated();
    }

    // A pre-existing draft with no warehouse still blocks every shelf of its items, both ways
    public function test_a_draft_without_a_warehouse_overlaps_every_shelf(): void
    {
        $item = $this->item('A-1', ['Main' => 10, 'Branch' => 5]);
        $old = StockCount::create(['status' => StockCountStatus::Draft, 'counted_by' => $this->user->id]);
        $old->lines()->create(['stock_item_id' => $item->id, 'system_qty' => 15, 'counted_qty' => null]);

        $this->open([$item->id], 'Branch')->assertUnprocessable()->assertJsonPath('reference', $old->reference);

        $this->deleteJson("/api/stock-counts/{$old->id}")->assertOk();
        $this->open([$item->id], 'Branch')->assertCreated();
    }

    public function test_a_closed_count_frees_its_items_for_a_new_one(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        $first = $this->open([$item->id], 'Main')->assertCreated()->json('data');
        $this->postJson("/api/stock-counts/{$first['id']}/commit", [])->assertOk();

        $this->open([$item->id], 'Main')->assertCreated();
    }

    public function test_an_overlap_left_from_before_is_refused_at_commit_so_stock_moves_once(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        $counts = collect(['SC-2026-901', 'SC-2026-902'])->map(function (string $reference) use ($item) {
            $count = StockCount::create(['reference' => $reference, 'warehouse' => 'Main', 'status' => StockCountStatus::Draft, 'counted_by' => $this->user->id]);
            $count->lines()->create(['stock_item_id' => $item->id, 'system_qty' => 10, 'counted_qty' => 8]);

            return $count;
        });

        $this->postJson("/api/stock-counts/{$counts[0]->id}/commit", [])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'count_overlap_commit')
            ->assertJsonPath('reference', 'SC-2026-902');
        $this->assertSame(10, $item->fresh()->current_stock);

        $this->deleteJson("/api/stock-counts/{$counts[1]->id}")->assertOk();
        $this->postJson("/api/stock-counts/{$counts[0]->id}/commit", [])->assertOk();
        $this->assertSame(8, $item->fresh()->current_stock);
    }

    public function test_a_report_only_commit_changes_no_stock_so_an_overlap_does_not_stop_it(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        foreach (['SC-2026-901', 'SC-2026-902'] as $reference) {
            $count = StockCount::create(['reference' => $reference, 'warehouse' => 'Main', 'status' => StockCountStatus::Draft, 'counted_by' => $this->user->id]);
            $count->lines()->create(['stock_item_id' => $item->id, 'system_qty' => 10, 'counted_qty' => 8]);
        }

        $this->postJson('/api/stock-counts/'.StockCount::where('reference', 'SC-2026-901')->value('id').'/commit', ['mode' => 'manual'])->assertOk();
        $this->assertSame(10, $item->fresh()->current_stock);
    }
}
