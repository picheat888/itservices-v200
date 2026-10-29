<?php

// A receive opens one numbered lot in its destination warehouse and links received serials to it.

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotReceiveTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-RCV-'.fake()->unique()->numerify('###'),
            'name' => 'Receive item',
            'track_serial' => $serial,
            'unit' => 'unit',
            'cost' => 500,
        ]);
    }

    public function test_receive_opens_one_numbered_lot_in_the_to_warehouse(): void
    {
        $main = Warehouse::create(['name' => 'Main']);
        $item = $this->item();

        $response = $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 935, 'to_label' => 'Main',
            ])
            ->assertCreated()
            ->assertJsonPath('data.lot.warehouse', 'Main')
            ->assertJsonPath('data.lot.qty', 10)
            ->assertJsonPath('data.lot.unit_cost', 935);

        $this->assertStringStartsWith('LOT-', $response->json('data.lot.lot_no'));
        $lot = StockLot::where('stock_item_id', $item->id)->sole();
        $this->assertSame($main->id, $lot->warehouse_id);
        $this->assertSame($lot->id, $response->json('data.lot.id'));
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_backdated_receive_numbers_by_its_own_day(): void
    {
        Warehouse::create(['name' => 'Main']);
        $item = $this->item();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'Main',
                'moved_at' => '2026-10-01 09:00:00',
            ])
            ->assertCreated();

        $this->assertStringStartsWith('LOT-20261001-', StockLot::where('stock_item_id', $item->id)->sole()->lot_no);
    }

    public function test_a_non_serial_receive_needs_a_qty(): void
    {
        Warehouse::create(['name' => 'Main']);
        $item = $this->item();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['X'], 'to_label' => 'Main',
            ])
            ->assertUnprocessable()->assertJsonValidationErrors('qty');

        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('stock_lots', 0);
    }

    public function test_serial_receive_links_every_serial_to_the_lot(): void
    {
        Warehouse::create(['name' => 'Main']);
        $item = $this->item(true);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['LS-1', 'LS-2'], 'to_label' => 'Main',
            ])
            ->assertCreated()
            ->assertJsonPath('data.lot.qty', 2);

        $lot = StockLot::where('stock_item_id', $item->id)->sole();
        $ids = StockItemSerial::where('stock_item_id', $item->id)->pluck('stock_lot_id')->all();
        $this->assertSame([$lot->id, $lot->id], $ids);
        $this->assertLotsMatchBalances($item);
    }

    public function test_item_show_names_each_serials_lot(): void
    {
        Warehouse::create(['name' => 'Main']);
        $item = $this->item(true);
        $user = User::factory()->create(['role' => 'super']);

        $this->actingAs($user)
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['LS-1', 'LS-2'], 'to_label' => 'Main',
            ])
            ->assertCreated();

        $lot = StockLot::where('stock_item_id', $item->id)->sole();
        $show = $this->actingAs($user)->getJson("/api/stock-items/{$item->id}")->assertOk();

        $this->assertSame([$lot->id, $lot->id], collect($show->json('data.serials'))->pluck('stock_lot_id')->all());
        $this->assertSame($lot->lot_no, collect($show->json('data.lots'))->firstWhere('id', $lot->id)['lot_no']);
    }

    public function test_receive_into_unassigned_opens_a_null_warehouse_lot(): void
    {
        $item = $this->item();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4, 'unit_cost' => 10,
            ])
            ->assertCreated()
            ->assertJsonPath('data.lot.warehouse', null);

        $this->assertNull(StockLot::where('stock_item_id', $item->id)->sole()->warehouse_id);
        $this->assertLotsMatchBalances($item);
    }
}
