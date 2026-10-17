<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// While a stock count is still a draft, its items take no movement on the shelf being counted.
class StockCountLockTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $sku, array $balances): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => array_sum($balances), 'min_stock' => 1, 'max_stock' => 100]);
        foreach ($balances as $warehouse => $qty) {
            $item->balances()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => $warehouse])->id, 'qty' => $qty]);
        }

        return $item;
    }

    private function approvedRequest(StockItem $item, int $qty): StockRequest
    {
        $requester = User::factory()->create(['role' => 'super']);
        $id = $this->actingAs($requester)->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => $qty, 'reason' => 'Spare'])->json('data.id');
        $this->actingAs(User::factory()->create(['role' => 'super']))->postJson("/api/stock-requests/{$id}/approve")->assertOk();

        return StockRequest::findOrFail($id);
    }

    public function test_a_draft_count_refuses_movements_on_its_shelf_and_names_itself(): void
    {
        $item = $this->item('A-1', ['Main' => 10, 'Branch' => 5]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $count = $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])->assertCreated()->json('data');

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'Main'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'count_in_progress')
            ->assertJsonPath('reference', $count['reference']);
        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1, 'from_label' => 'Branch', 'to_label' => 'Main'])
            ->assertUnprocessable()->assertJsonPath('message', 'count_in_progress');

        // Another shelf of the same item is not being counted.
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'Branch'])->assertCreated();
    }

    public function test_an_all_warehouse_count_refuses_every_shelf_of_its_items_only(): void
    {
        $counted = $this->item('A-1', ['Main' => 10]);
        Warehouse::create(['name' => 'Branch']);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson('/api/stock-counts', ['stock_item_ids' => [$counted->id]])->assertCreated();
        $other = $this->item('B-1', ['Main' => 4]);

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $counted->id, 'qty' => 1, 'to_label' => 'Branch'])
            ->assertUnprocessable()->assertJsonPath('message', 'count_in_progress');
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $other->id, 'qty' => 1, 'to_label' => 'Main'])->assertCreated();
    }

    public function test_the_item_list_and_detail_name_the_draft_count_holding_an_item(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        $free = $this->item('B-1', ['Branch' => 2]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $count = $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])->assertCreated()->json('data');

        $rows = collect($this->getJson('/api/stock-items')->assertOk()->json('data'))->keyBy('sku');
        $this->assertSame([['reference' => $count['reference'], 'warehouse' => 'Main']], $rows['A-1']['counting']);
        $this->assertSame([], $rows['B-1']['counting']);
        $this->getJson("/api/stock-items/{$item->id}")->assertOk()->assertJsonPath('data.counting.0.reference', $count['reference']);
        $this->getJson("/api/stock-items/{$free->id}")->assertOk()->assertJsonPath('data.counting', []);
    }

    public function test_fulfilling_a_request_from_a_shelf_being_counted_is_refused_until_the_count_closes(): void
    {
        $item = $this->item('A-1', ['Main' => 10]);
        $request = $this->approvedRequest($item, 3);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $count = $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])->assertCreated()->json('data');

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'Main'])
            ->assertUnprocessable()->assertJsonPath('message', 'count_in_progress');
        $this->assertSame(10, $item->fresh()->current_stock);

        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$count['lines'][0]['id'] => 10]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'Main'])->assertOk();
        $this->assertSame(7, $item->fresh()->current_stock);
    }
}
