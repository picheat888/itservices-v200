<?php

// StockLotService: per-warehouse FIFO draws, returns, lot moves and the lot ledger entries they write.

namespace Tests\Feature;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Services\Stock\StockLotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotServiceTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    private StockLotService $lots;

    private StockItem $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->lots = app(StockLotService::class);
        $this->item = StockItem::create(['sku' => 'SK-LOT-1', 'name' => 'Lot item']);
    }

    private function warehouse(string $name): Warehouse
    {
        return Warehouse::create(['name' => $name]);
    }

    private function movement(string $type, int $qty, string $movedAt = '2026-10-28 10:00:00', ?Warehouse $from = null, ?Warehouse $to = null): StockMovement
    {
        return StockMovement::create([
            'type' => $type,
            'stock_item_id' => $this->item->id,
            'qty' => $qty,
            'moved_at' => Carbon::parse($movedAt),
            'from_warehouse_id' => $from?->id,
            'to_warehouse_id' => $to?->id,
        ]);
    }

    /** A lot built directly, with its opening entry so the ledger matches. */
    private function lot(?Warehouse $warehouse, int $qty, string $receivedAt, float $unitCost = 100): StockLot
    {
        $lot = StockLot::create([
            'stock_item_id' => $this->item->id,
            'warehouse_id' => $warehouse?->id,
            'unit_cost' => $unitCost,
            'qty_received' => $qty,
            'qty_remaining' => $qty,
            'received_at' => Carbon::parse($receivedAt),
        ]);
        StockLotEntry::create([
            'stock_lot_id' => $lot->id,
            'warehouse_id' => $warehouse?->id,
            'qty' => $qty,
            'occurred_at' => Carbon::parse($receivedAt),
        ]);

        return $lot;
    }

    private function balance(?Warehouse $warehouse, int $qty): void
    {
        StockBalance::create(['stock_item_id' => $this->item->id, 'warehouse_id' => $warehouse?->id, 'qty' => $qty]);
    }

    public function test_open_numbers_the_lot_and_writes_a_plus_entry(): void
    {
        $b = $this->warehouse('B');
        $movement = $this->movement('receive', 10, '2026-10-28 09:30:00', to: $b);

        $lot = $this->lots->open($this->item, $b->id, 10, 935.00, $movement, 'PO-77');

        $this->assertMatchesRegularExpression('/^LOT-\d{8}-\d{4,}$/', $lot->lot_no);
        $this->assertSame('LOT-20261028-0001', $lot->lot_no);
        $this->assertSame($b->id, $lot->warehouse_id);
        $this->assertSame(10, $lot->qty_received);
        $this->assertSame(10, $lot->qty_remaining);
        $this->assertSame('935.00', $lot->unit_cost);
        $this->assertSame($movement->id, $lot->stock_movement_id);
        $this->assertSame('2026-10-28 09:30:00', $lot->received_at->toDateTimeString());

        $entries = $lot->entries()->get();
        $this->assertCount(1, $entries);
        $this->assertSame(10, $entries[0]->qty);
        $this->assertSame($b->id, $entries[0]->warehouse_id);
        $this->assertNull($entries[0]->from_warehouse_id);
        $this->assertSame($movement->id, $entries[0]->stock_movement_id);
        $this->assertSame('PO-77', $entries[0]->reference);
        $this->assertSame('2026-10-28 09:30:00', $entries[0]->occurred_at->toDateTimeString());

        $this->assertLotsMatchEntries($this->item);
    }

    public function test_open_without_a_movement_stamps_now(): void
    {
        Carbon::setTestNow('2026-10-29 08:00:00');

        $lot = $this->lots->open($this->item, null, 3, 50, null);

        $this->assertSame('LOT-20261029-0001', $lot->lot_no);
        $this->assertNull($lot->warehouse_id);
        $this->assertSame('2026-10-29 08:00:00', $lot->received_at->toDateTimeString());
        $this->assertNull($lot->entries()->first()->stock_movement_id);

        $this->assertLotsMatchEntries($this->item);
    }

    public function test_consume_takes_oldest_first_within_the_warehouse_only(): void
    {
        $a = $this->warehouse('A');
        $b = $this->warehouse('B');
        $a1 = $this->lot($a, 6, '2026-08-12 10:00:00');
        $a2 = $this->lot($a, 21, '2026-09-30 10:00:00');
        $b1 = $this->lot($b, 5, '2026-07-01 10:00:00');
        $this->balance($a, 27);
        $this->balance($b, 5);
        $movement = $this->movement('issue', 10, from: $a);

        $taken = $this->lots->consume($this->item, $a->id, 10, $movement, 'ISS-1');

        $this->assertSame([$a1->id => 6, $a2->id => 4], $taken);
        $this->assertSame(0, $a1->fresh()->qty_remaining);
        $this->assertSame(17, $a2->fresh()->qty_remaining);
        $this->assertSame(5, $b1->fresh()->qty_remaining);

        $draws = StockLotEntry::where('stock_movement_id', $movement->id)->orderBy('id')->get();
        $this->assertSame([-6, -4], $draws->pluck('qty')->all());
        $this->assertSame([$a->id, $a->id], $draws->pluck('warehouse_id')->all());
        $this->assertSame(['ISS-1', 'ISS-1'], $draws->pluck('reference')->all());
        $this->assertSame(0, StockLotEntry::where('stock_lot_id', $b1->id)->where('qty', '<', 0)->count());

        StockBalance::where('warehouse_id', $a->id)->update(['qty' => 17]);
        $this->assertLotsMatchBalances($this->item);
        $this->assertLotsMatchEntries($this->item);
    }

    public function test_consume_draws_the_unassigned_bucket_on_its_own(): void
    {
        $a = $this->warehouse('A');
        $loose = $this->lot(null, 4, '2026-09-01 10:00:00');
        $inA = $this->lot($a, 4, '2026-08-01 10:00:00');

        $taken = $this->lots->consume($this->item, null, 3, null);

        $this->assertSame([$loose->id => 3], $taken);
        $this->assertSame(4, $inA->fresh()->qty_remaining);
        $this->assertLotsMatchEntries($this->item);
    }

    public function test_consume_refuses_when_the_warehouse_is_short(): void
    {
        $a = $this->warehouse('A');
        $b = $this->warehouse('B');
        $a1 = $this->lot($a, 3, '2026-08-12 10:00:00');
        $this->lot($b, 9, '2026-08-01 10:00:00');
        $entriesBefore = StockLotEntry::count();

        try {
            $this->lots->consume($this->item, $a->id, 4, null);
            $this->fail('consume() should refuse a short warehouse');
        } catch (ValidationException $e) {
            $this->assertSame('not_enough_stock_in_warehouse', $e->getMessage());
            $this->assertSame('A', $e->response->getData(true)['warehouse']);
            $this->assertSame(3, $e->response->getData(true)['available']);
        }

        $this->assertSame(3, $a1->fresh()->qty_remaining);
        $this->assertSame($entriesBefore, StockLotEntry::count());
        $this->assertLotsMatchEntries($this->item);
    }

    public function test_consume_lots_draws_named_lots_and_refuses_a_short_lot(): void
    {
        $a = $this->warehouse('A');
        $old = $this->lot($a, 5, '2026-08-01 10:00:00');
        $new = $this->lot($a, 5, '2026-09-01 10:00:00');
        $new->update(['lot_no' => 'LOT-20260901-0001']);
        $movement = $this->movement('issue', 2, from: $a);

        $this->lots->consumeLots([$new->id => 2], $movement, 'ISS-2');

        $this->assertSame(5, $old->fresh()->qty_remaining);
        $this->assertSame(3, $new->fresh()->qty_remaining);
        $draw = StockLotEntry::where('stock_movement_id', $movement->id)->sole();
        $this->assertSame(-2, $draw->qty);
        $this->assertSame($a->id, $draw->warehouse_id);
        $this->assertSame('ISS-2', $draw->reference);

        try {
            $this->lots->consumeLots([$old->id => 1, $new->id => 4], null);
            $this->fail('consumeLots() should refuse a short lot');
        } catch (ValidationException $e) {
            $this->assertSame('lot_short', $e->getMessage());
            $this->assertSame('LOT-20260901-0001', $e->response->getData(true)['lot_no']);
        }

        $this->assertSame(5, $old->fresh()->qty_remaining);
        $this->assertSame(3, $new->fresh()->qty_remaining);
        $this->assertLotsMatchEntries($this->item);
    }

    public function test_restore_adds_back_with_the_lots_current_warehouse(): void
    {
        $a = $this->warehouse('A');
        $b = $this->warehouse('B');
        $lot = $this->lot($a, 5, '2026-08-01 10:00:00');
        $this->lots->consume($this->item, $a->id, 4, null);
        $lot->update(['warehouse_id' => $b->id]);
        $movement = $this->movement('return', 2, '2026-10-28 14:00:00', to: $b);

        $this->lots->restore($lot, 2, $movement, 'RET-1');

        $this->assertSame(3, $lot->fresh()->qty_remaining);
        $this->assertSame(5, $lot->fresh()->qty_received);
        $back = StockLotEntry::where('stock_movement_id', $movement->id)->sole();
        $this->assertSame(2, $back->qty);
        $this->assertSame($b->id, $back->warehouse_id);
        $this->assertSame('RET-1', $back->reference);
        $this->assertSame('2026-10-28 14:00:00', $back->occurred_at->toDateTimeString());

        $this->assertLotsMatchEntries($this->item);
    }

    public function test_move_lot_writes_a_zero_entry_and_keeps_the_number(): void
    {
        $a = $this->warehouse('A');
        $b = $this->warehouse('B');
        $lot = $this->lots->open($this->item, $a->id, 8, 120, $this->movement('receive', 8, '2026-10-01 09:00:00', to: $a));
        $number = $lot->lot_no;
        $this->lots->consume($this->item, $a->id, 3, null);
        $movement = $this->movement('transfer', 5, '2026-10-28 11:00:00', $a, $b);

        $moved = $this->lots->moveLot($lot->fresh(), $b->id, $movement);

        $this->assertSame(5, $moved);
        $lot->refresh();
        $this->assertSame($b->id, $lot->warehouse_id);
        $this->assertSame($number, $lot->lot_no);
        $this->assertSame(5, $lot->qty_remaining);
        $entry = StockLotEntry::where('stock_movement_id', $movement->id)->sole();
        $this->assertSame(0, $entry->qty);
        $this->assertSame($a->id, $entry->from_warehouse_id);
        $this->assertSame($b->id, $entry->warehouse_id);
        $this->assertSame('2026-10-28 11:00:00', $entry->occurred_at->toDateTimeString());

        $this->assertLotsMatchEntries($this->item);
    }

    public function test_plan_matches_consume_without_writing(): void
    {
        $a = $this->warehouse('A');
        $b = $this->warehouse('B');
        $a1 = $this->lot($a, 6, '2026-08-12 10:00:00');
        $a2 = $this->lot($a, 21, '2026-09-30 10:00:00');
        $a2->update(['lot_no' => 'LOT-20260930-0001']);
        $this->lot($b, 5, '2026-07-01 10:00:00');
        $entriesBefore = StockLotEntry::count();

        $plan = $this->lots->plan($this->item, $a->id, 10);

        $this->assertSame([
            ['lot_id' => $a1->id, 'lot_no' => null, 'received_at' => '2026-08-12 10:00:00', 'remaining' => 6, 'take' => 6],
            ['lot_id' => $a2->id, 'lot_no' => 'LOT-20260930-0001', 'received_at' => '2026-09-30 10:00:00', 'remaining' => 21, 'take' => 4],
        ], $plan);
        $this->assertSame(6, $a1->fresh()->qty_remaining);
        $this->assertSame($entriesBefore, StockLotEntry::count());

        $taken = $this->lots->consume($this->item, $a->id, 10, null);
        $this->assertSame(array_column($plan, 'take', 'lot_id'), $taken);

        $this->assertLotsMatchEntries($this->item);
    }
}
