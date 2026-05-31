<?php

namespace Tests\Feature;

use App\Models\StockBalance;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockLot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockTransferTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(int $stock = 0, bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-TR-'.fake()->unique()->numerify('###'),
            'name' => 'Transfer item', 'unit' => 'unit', 'cost' => 0,
            'current_stock' => $stock, 'min_stock' => 0, 'max_stock' => 0,
            'warehouse' => 'WH-A', 'track_serial' => $serial,
        ]);
    }

    public function test_transfer_is_stock_and_lot_neutral_and_moves_balance(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 100, 'to_label' => 'WH-A',
        ])->assertCreated();

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 4, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertCreated()->assertJsonPath('data.type', 'transfer');

        $item->refresh();
        $this->assertSame(10, $item->current_stock, 'transfer must not change total');
        $this->assertSame(10, (int) StockLot::where('stock_item_id', $item->id)->sum('qty_remaining'), 'transfer must not consume lots');
        $this->assertSame(6, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }

    public function test_transfer_rejects_over_source_balance(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 5, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertStatus(422);
    }

    public function test_transfer_assigns_doc_no(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 2, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertCreated()->assertJsonPath('data.doc_no', 'TRF-'.now()->year.'-001');
    }

    public function test_serialized_transfer_moves_selected_serials_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SNT-1', 'SNT-2'], 'to_label' => 'WH-A',
        ])->assertCreated();

        $serialId = StockItemSerial::where('serial', 'SNT-1')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
            'serial_ids' => [$serialId],
        ])->assertCreated();

        $this->assertSame('WH-B', StockItemSerial::find($serialId)->warehouse);
        $this->assertSame('WH-A', StockItemSerial::where('serial', 'SNT-2')->value('warehouse'));
        $this->assertSame(1, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }

    public function test_transfer_requires_from_and_to_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['from_label', 'to_label']);
    }

    public function test_receive_without_warehouse_falls_back_to_item_home(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(); // warehouse WH-A
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4])->assertCreated();

        // Balance lands at the item's home warehouse, never an empty string.
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
        $this->assertSame(0, StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => ''])->count());
    }
}
