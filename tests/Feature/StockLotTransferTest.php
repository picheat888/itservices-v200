<?php

// Transfers move whole lots: lot numbers and costs stay, the lot changes warehouse, the ledger gets a qty-0 entry.

namespace Tests\Feature;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotTransferTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Warehouse::create(['name' => 'A']);
        Warehouse::create(['name' => 'B']);
        $this->actingAs(User::factory()->create(['role' => 'super']));
    }

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-TL-'.fake()->unique()->numerify('###'),
            'name' => 'Lot transfer item', 'unit' => 'unit', 'cost' => 100, 'track_serial' => $serial,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function receive(StockItem $item, string $warehouse, string $movedAt, array $extra = []): StockLot
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'to_label' => $warehouse, 'moved_at' => $movedAt, ...$extra,
        ])->assertCreated();

        return StockLot::where('stock_item_id', $item->id)->latest('id')->firstOrFail();
    }

    /** @param  list<int>  $lotIds */
    private function transfer(StockItem $item, array $lotIds, string $from = 'A', string $to = 'B'): TestResponse
    {
        return $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => $from, 'to_label' => $to, 'lot_ids' => $lotIds,
        ]);
    }

    private function assertLedger(StockItem $item): void
    {
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_transfer_moves_whole_lots_and_keeps_numbers(): void
    {
        $item = $this->item();
        $l1 = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 6, 'unit_cost' => 50]);
        $l2 = $this->receive($item, 'A', '2026-09-01 10:00:00', ['qty' => 4, 'unit_cost' => 70]);
        $lotNos = [$l1->lot_no, $l2->lot_no];
        $lotCount = StockLot::count();

        $this->transfer($item, [$l1->id, $l2->id])->assertCreated()->assertJsonPath('data.qty', 10);

        $movement = StockMovement::where('type', 'transfer')->sole();
        $this->assertSame(10, $movement->qty);
        $this->assertSame($lotCount, StockLot::count());
        $this->assertSame($lotNos, [$l1->fresh()->lot_no, $l2->fresh()->lot_no]);
        $this->assertSame(Warehouse::where('name', 'B')->value('id'), $l1->fresh()->warehouse_id);
        $this->assertSame(Warehouse::where('name', 'B')->value('id'), $l2->fresh()->warehouse_id);
        $this->assertEquals(50, $l1->fresh()->unit_cost);
        $this->assertSame(6, $l1->fresh()->qty_remaining);

        $entry = StockLotEntry::where('stock_movement_id', $movement->id)->where('stock_lot_id', $l1->id)->sole();
        $this->assertSame(0, $entry->qty);
        $this->assertSame(Warehouse::where('name', 'A')->value('id'), $entry->from_warehouse_id);

        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertLedger($item);
    }

    public function test_serial_transfer_moves_every_serial_of_the_lot(): void
    {
        $item = $this->item(true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2', 'S-3']]);
        StockItemSerial::where('serial', 'S-3')->update(['status' => 'issued']);

        $this->transfer($item, [$lot->id])->assertCreated();

        $warehouseB = Warehouse::where('name', 'B')->value('id');
        $this->assertSame($warehouseB, StockItemSerial::where('serial', 'S-1')->value('warehouse_id'));
        $this->assertSame($warehouseB, StockItemSerial::where('serial', 'S-2')->value('warehouse_id'));
        $this->assertNotSame($warehouseB, StockItemSerial::where('serial', 'S-3')->value('warehouse_id'));
        $this->assertSame(2, StockItemSerialEvent::where('event', 'transferred')->count());
        $this->assertSame($warehouseB, $lot->fresh()->warehouse_id);
        $this->assertLedger($item);
    }

    public function test_transfer_of_an_empty_or_foreign_lot_is_refused(): void
    {
        $item = $this->item();
        $other = $this->item();
        $good = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 5]);
        $empty = $this->receive($item, 'A', '2026-08-02 10:00:00', ['qty' => 2]);
        $foreign = $this->receive($other, 'A', '2026-08-03 10:00:00', ['qty' => 3]);
        StockLot::whereKey($empty->id)->update(['qty_remaining' => 0]);
        StockLotEntry::where('stock_lot_id', $empty->id)->update(['qty' => 0]);
        StockBalance::where('stock_item_id', $item->id)->decrement('qty', 2);

        foreach ([[$good->id, $empty->id], [$good->id, $foreign->id], [$good->id, 999999]] as $lotIds) {
            $this->transfer($item, $lotIds)->assertStatus(422);
        }
        $this->transfer($item, [$good->id, $empty->id])->assertJsonPath('message', 'transfer_lot_invalid');

        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
        $this->assertSame(Warehouse::where('name', 'A')->value('id'), $good->fresh()->warehouse_id);
        $this->assertLedger($item);
        $this->assertLedger($other);
    }

    public function test_transfer_to_the_same_warehouse_is_refused(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 5]);

        $this->transfer($item, [$lot->id], 'A', 'A')->assertStatus(422)->assertJsonPath('message', 'same_warehouse');

        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
        $this->assertLedger($item);
    }

    public function test_transfer_refuses_partial_payloads(): void
    {
        $item = $this->item(true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2']]);
        $serialId = StockItemSerial::where('serial', 'S-1')->value('id');
        $payload = ['type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'A', 'to_label' => 'B', 'lot_ids' => [$lot->id]];

        $this->postJson('/api/stock-movements', [...$payload, 'qty' => 1])->assertStatus(422)->assertJsonValidationErrors(['qty']);
        $this->postJson('/api/stock-movements', [...$payload, 'serial_ids' => [$serialId]])->assertStatus(422)->assertJsonValidationErrors(['serial_ids']);
        $this->postJson('/api/stock-movements', [...$payload, 'serials' => ['X']])->assertStatus(422)->assertJsonValidationErrors(['serials']);

        $this->assertSame(0, StockMovement::where('type', 'transfer')->count());
        $this->assertSame(Warehouse::where('name', 'A')->value('id'), $lot->fresh()->warehouse_id);
        $this->assertLedger($item);
    }
}
