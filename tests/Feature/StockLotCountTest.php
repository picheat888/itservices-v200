<?php

// Counts book their difference on the counted warehouse's lots: shortages draw FIFO, overages open a lot, serials keep their lot.

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotCountTest extends TestCase
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

    private function warehouseId(string $name): int
    {
        return (int) Warehouse::where('name', $name)->value('id');
    }

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-CL-'.fake()->unique()->numerify('###'),
            'name' => 'Lot count item', 'unit' => 'unit', 'cost' => 100, 'track_serial' => $serial,
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

    /**
     * Open a count of one item in a warehouse, save its line and confirm it.
     *
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function countAndCommit(StockItem $item, string $warehouse, array $line): array
    {
        $count = $this->postJson('/api/stock-counts', ['warehouse_id' => $this->warehouseId($warehouse), 'stock_item_ids' => [$item->id]])
            ->assertCreated()->json('data');

        return $this->saveAndCommit($count, $line);
    }

    /**
     * @param  array<string, mixed>  $count
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function saveAndCommit(array $count, array $line): array
    {
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => $line]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        return $count;
    }

    /** @return array<string, mixed> */
    private function recount(array $original): array
    {
        return $this->postJson("/api/stock-counts/{$original['id']}/recount")->assertCreated()->json('data');
    }

    private function assertLedger(StockItem $item): void
    {
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_count_shortage_draws_oldest_lot_in_the_counted_warehouse(): void
    {
        $item = $this->item();
        $inB = $this->receive($item, 'B', '2026-07-01 10:00:00', ['qty' => 3, 'unit_cost' => 40]);
        $old = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 4, 'unit_cost' => 50]);
        $new = $this->receive($item, 'A', '2026-09-01 10:00:00', ['qty' => 5, 'unit_cost' => 70]);

        $count = $this->countAndCommit($item, 'A', ['counted_qty' => 6, 'reason' => 'lost']);

        $movement = StockMovement::where('type', 'adjust_down')->sole();
        $this->assertSame(1, $old->fresh()->qty_remaining);
        $this->assertSame(5, $new->fresh()->qty_remaining);
        $this->assertSame(3, $inB->fresh()->qty_remaining);
        $entry = StockLotEntry::where('stock_movement_id', $movement->id)->sole();
        $this->assertSame([$old->id, -3, $count['reference']], [$entry->stock_lot_id, $entry->qty, $entry->reference]);
        $this->assertSame(9, $item->fresh()->current_stock);
        $this->assertLedger($item);
    }

    public function test_count_overage_opens_a_new_numbered_lot(): void
    {
        $item = $this->item();
        $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 4, 'unit_cost' => 50]);
        $this->receive($item, 'A', '2026-09-01 10:00:00', ['qty' => 4, 'unit_cost' => 100]);

        $count = $this->countAndCommit($item, 'A', ['counted_qty' => 10, 'reason' => 'inbound']);

        $movement = StockMovement::where('type', 'adjust_up')->sole();
        $lot = StockLot::where('stock_movement_id', $movement->id)->sole();
        $this->assertMatchesRegularExpression('/^LOT-\d{8}-\d{4,}$/', $lot->lot_no);
        $this->assertSame($this->warehouseId('A'), $lot->warehouse_id);
        $this->assertSame([2, 2], [$lot->qty_received, $lot->qty_remaining]);
        $this->assertEquals(75, $lot->unit_cost);
        $entry = StockLotEntry::where('stock_lot_id', $lot->id)->sole();
        $this->assertSame([2, $movement->id, $count['reference']], [$entry->qty, $entry->stock_movement_id, $entry->reference]);
        $this->assertSame(3, StockLot::where('stock_item_id', $item->id)->count());
        $this->assertLedger($item);
    }

    public function test_found_serial_returns_to_its_lot_when_the_lot_is_here(): void
    {
        $item = $this->item(true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2', 'S-3']]);
        $lost = StockItemSerial::where('serial', 'S-1')->sole();

        $original = $this->countAndCommit($item, 'A', ['missing_serial_ids' => [$lost->id], 'reason' => 'lost']);
        $down = StockMovement::where('type', 'adjust_down')->sole();
        $this->assertSame(2, $lot->fresh()->qty_remaining);
        $this->assertSame(-1, StockLotEntry::where('stock_movement_id', $down->id)->where('stock_lot_id', $lot->id)->sole()->qty);
        $this->assertLedger($item);

        $recount = $this->saveAndCommit($this->recount($original), ['found_serial_ids' => [$lost->id], 'reason' => 'miscount']);

        $up = StockMovement::where('type', 'adjust_up')->sole();
        $this->assertSame(3, $lot->fresh()->qty_remaining);
        $this->assertSame(1, StockLot::where('stock_item_id', $item->id)->count());
        $this->assertSame($lot->id, $lost->fresh()->stock_lot_id);
        $entry = StockLotEntry::where('stock_movement_id', $up->id)->sole();
        $this->assertSame([$lot->id, 1, $recount['reference']], [$entry->stock_lot_id, $entry->qty, $entry->reference]);
        $this->assertLedger($item);
    }

    public function test_found_serial_whose_lot_moved_away_opens_a_new_lot_here(): void
    {
        $item = $this->item(true);
        $old = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2', 'S-3'], 'unit_cost' => 80]);
        $lost = StockItemSerial::where('serial', 'S-1')->sole();
        $original = $this->countAndCommit($item, 'A', ['missing_serial_ids' => [$lost->id], 'reason' => 'lost']);
        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'A', 'to_label' => 'B', 'lot_ids' => [$old->id],
        ])->assertCreated();
        $oldEntries = StockLotEntry::where('stock_lot_id', $old->id)->count();

        $recount = $this->saveAndCommit($this->recount($original), ['found_serial_ids' => [$lost->id], 'reason' => 'miscount']);

        $up = StockMovement::where('type', 'adjust_up')->sole();
        $fresh = $old->fresh();
        $this->assertSame([$this->warehouseId('B'), 2], [$fresh->warehouse_id, $fresh->qty_remaining]);
        $this->assertSame($oldEntries, StockLotEntry::where('stock_lot_id', $old->id)->count());
        $here = StockLot::where('stock_item_id', $item->id)->whereKeyNot($old->id)->sole();
        $this->assertMatchesRegularExpression('/^LOT-\d{8}-\d{4,}$/', $here->lot_no);
        $this->assertSame([$this->warehouseId('A'), 1, 1], [$here->warehouse_id, $here->qty_received, $here->qty_remaining]);
        $this->assertEquals(80, $here->unit_cost);
        $this->assertSame($here->id, $lost->fresh()->stock_lot_id);
        $entry = StockLotEntry::where('stock_lot_id', $here->id)->sole();
        $this->assertSame([1, $up->id, $recount['reference']], [$entry->qty, $entry->stock_movement_id, $entry->reference]);
        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertLedger($item);
    }

    public function test_cancelling_serial_line_writes_entries_without_a_movement(): void
    {
        $item = $this->item(true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2', 'S-3']]);
        $lost = StockItemSerial::where('serial', 'S-1')->sole();
        $original = $this->countAndCommit($item, 'A', ['missing_serial_ids' => [$lost->id], 'reason' => 'lost']);
        $nowMissing = StockItemSerial::where('serial', 'S-2')->sole();

        $recount = $this->saveAndCommit($this->recount($original), ['missing_serial_ids' => [$nowMissing->id], 'found_serial_ids' => [$lost->id]]);

        $this->assertSame(0, StockMovement::where('reference', $recount['reference'])->count());
        $entries = StockLotEntry::where('reference', $recount['reference'])->orderBy('id')->get();
        $this->assertSame([-1, 1], $entries->pluck('qty')->all());
        $this->assertSame([null, null], $entries->pluck('stock_movement_id')->all());
        $this->assertSame([$lot->id, $lot->id], $entries->pluck('stock_lot_id')->all());
        $this->assertSame(2, $lot->fresh()->qty_remaining);
        $this->assertSame(['in_stock', 'adjusted'], [$lost->fresh()->status, $nowMissing->fresh()->status]);
        $this->assertSame(2, $item->fresh()->current_stock);
        $this->assertLedger($item);
    }
}
