<?php

namespace Tests\Feature;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class StockTransferTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Warehouse::firstOrCreate(['name' => 'WH-A']);
        Warehouse::firstOrCreate(['name' => 'WH-B']);
    }

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
            'track_serial' => $serial,
        ]);
    }

    private function balance(StockItem $item, string $warehouse): int
    {
        return (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::where('name', $warehouse)->value('id')])->value('qty');
    }

    private function receiveSerial(StockItem $item, string $serial, string $warehouse): int
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => [$serial], 'to_label' => $warehouse,
        ])->assertCreated();

        return (int) StockItemSerial::where('serial', $serial)->value('id');
    }

    private function transferSerials(StockItem $item, array $serialIds, string $from = 'WH-A', string $to = 'WH-B'): TestResponse
    {
        return $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => $from, 'to_label' => $to,
            'serial_ids' => $serialIds,
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
        $this->assertSame(6, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::where('name', 'WH-A')->value('id')])->value('qty'));
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::where('name', 'WH-B')->value('id')])->value('qty'));
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

        $this->assertSame(Warehouse::where('name', 'WH-B')->value('id'), StockItemSerial::find($serialId)->warehouse_id);
        $this->assertSame(Warehouse::where('name', 'WH-A')->value('id'), StockItemSerial::where('serial', 'SNT-2')->value('warehouse_id'));
        $this->assertSame(1, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::where('name', 'WH-B')->value('id')])->value('qty'));
    }

    public function test_serialized_transfer_refuses_serials_of_another_item(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $other = $this->item(0, true);
        $own = $this->receiveSerial($item, 'SNT-1', 'WH-A');
        $foreign = $this->receiveSerial($other, 'SNT-X', 'WH-A');

        $this->transferSerials($item, [$foreign])
            ->assertStatus(422)
            ->assertJsonPath('message', 'transfer_serials_invalid')
            ->assertJsonValidationErrors(['serial_ids']);

        $this->assertSame(1, $this->balance($item, 'WH-A'));
        $this->assertSame(0, $this->balance($item, 'WH-B'));
        $this->assertSame(Warehouse::where('name', 'WH-A')->value('id'), StockItemSerial::find($foreign)->warehouse_id);
        $this->assertSame(Warehouse::where('name', 'WH-A')->value('id'), StockItemSerial::find($own)->warehouse_id);
        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
    }

    public function test_serialized_transfer_refuses_an_issued_serial(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $issued = $this->receiveSerial($item, 'SNT-1', 'WH-A');
        StockItemSerial::whereKey($issued)->update(['status' => 'issued']);

        $this->transferSerials($item, [$issued])
            ->assertStatus(422)
            ->assertJsonPath('message', 'transfer_serials_invalid');

        $this->assertSame(1, $this->balance($item, 'WH-A'));
        $this->assertSame(Warehouse::where('name', 'WH-A')->value('id'), StockItemSerial::find($issued)->warehouse_id);
        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
    }

    public function test_serialized_transfer_refuses_a_serial_outside_the_source_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $this->receiveSerial($item, 'SNT-1', 'WH-A');
        $elsewhere = $this->receiveSerial($item, 'SNT-2', 'WH-B');

        $this->transferSerials($item, [$elsewhere], 'WH-A', 'WH-B')
            ->assertStatus(422)
            ->assertJsonPath('message', 'transfer_serials_invalid');

        $this->assertSame(1, $this->balance($item, 'WH-A'));
        $this->assertSame(1, $this->balance($item, 'WH-B'));
        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
    }

    public function test_serialized_transfer_requires_serial_ids(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $this->receiveSerial($item, 'SNT-1', 'WH-A');

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'WH-A', 'to_label' => 'WH-B', 'qty' => 1,
        ])->assertStatus(422)->assertJsonPath('message', 'transfer_serials_required');

        $this->assertSame(1, $this->balance($item, 'WH-A'));
        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
    }

    public function test_receive_refuses_an_unknown_warehouse_and_creates_none(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4, 'to_label' => 'WH-NEW'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to_label']);

        $this->assertDatabaseMissing('warehouses', ['name' => 'WH-NEW']);
        $this->assertSame(0, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_receive_into_an_existing_warehouse_still_works(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4, 'to_label' => 'WH-A'])
            ->assertCreated();

        $this->assertSame(4, $this->balance($item, 'WH-A'));
    }

    public function test_transfer_refuses_unknown_source_or_destination_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1, 'from_label' => 'WH-A', 'to_label' => 'WH-NEW'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to_label']);
        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1, 'from_label' => 'WH-NEW', 'to_label' => 'WH-B'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['from_label']);

        $this->assertDatabaseMissing('warehouses', ['name' => 'WH-NEW']);
        $this->assertSame(5, $this->balance($item, 'WH-A'));
    }

    public function test_transfer_out_of_unassigned_is_allowed(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4])->assertCreated();

        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 3, 'from_label' => 'Unassigned', 'to_label' => 'WH-A'])
            ->assertCreated();

        $this->assertSame(3, $this->balance($item, 'WH-A'));
        $this->assertSame(1, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => null])->value('qty'));
        $this->assertDatabaseMissing('warehouses', ['name' => 'Unassigned']);
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

    public function test_receive_without_warehouse_lands_in_unassigned(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4])->assertCreated();

        // With no SKU-level home warehouse, an unspecified destination parks under 'Unassigned' (never '').
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse_id' => null])->value('qty'));
        // Blank sentinel is impossible now; the item has exactly one (Unassigned) balance row.
        $this->assertSame(1, StockBalance::where('stock_item_id', $item->id)->count());
    }
}
