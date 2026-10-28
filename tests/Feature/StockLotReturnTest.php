<?php

// Returning against a request: the units go back into the lots that request drew, wherever those lots sit now.

namespace Tests\Feature;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockBalanceService;
use App\Services\Stock\StockLotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotReturnTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();

        Warehouse::create(['name' => 'A']);
        Warehouse::create(['name' => 'B']);
        $this->super = User::factory()->create(['role' => 'super']);
        $this->actingAs($this->super);
    }

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-RET-'.fake()->unique()->numerify('###'),
            'name' => 'Return item',
            'unit' => 'unit',
            'cost' => 100,
            'track_serial' => $serial,
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

    /** @param  array<string, mixed>  $payload */
    private function fulfilled(StockItem $item, int $qty, array $payload): StockRequest
    {
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => $qty, 'reason' => 'Use', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$request->id}/fulfill", $payload)->assertOk();

        return $request->fresh();
    }

    /** @param  array<string, mixed>  $payload */
    private function returnStock(StockItem $item, StockRequest $request, array $payload): TestResponse
    {
        return $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $request->id, ...$payload,
        ]);
    }

    /** A holds L1 (6, Aug) and L2 (10, Sep); a request of 10 drew L1 6 and L2 4. */
    private function issuedTen(StockItem $item): array
    {
        $l1 = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 6]);
        $l2 = $this->receive($item, 'A', '2026-09-01 10:00:00', ['qty' => 10]);
        $request = $this->fulfilled($item, 10, ['from_warehouse' => 'A']);

        return [$l1, $l2, $request];
    }

    private function balance(StockItem $item, string $warehouse): int
    {
        return (int) StockBalance::where('stock_item_id', $item->id)
            ->where('warehouse_id', Warehouse::where('name', $warehouse)->value('id'))
            ->value('qty');
    }

    private function assertLedger(StockItem $item): void
    {
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_return_goes_back_into_the_lot_the_request_drew(): void
    {
        $item = $this->item();
        [$l1, $l2, $request] = $this->issuedTen($item);
        $this->assertSame(6, $l2->fresh()->qty_remaining);
        $lotsBefore = StockLot::count();

        $this->returnStock($item, $request, ['lots' => [['lot_id' => $l2->id, 'qty' => 3]]])->assertCreated();

        $this->assertSame(9, $l2->fresh()->qty_remaining);
        $this->assertSame(0, $l1->fresh()->qty_remaining);
        $this->assertSame($lotsBefore, StockLot::count());

        $movement = StockMovement::where('type', 'return')->sole();
        $this->assertStringStartsWith('RET-', $movement->doc_no);
        $this->assertSame($request->id, $movement->stock_request_id);
        $this->assertSame(3, $movement->qty);
        $this->assertSame('A', $movement->to_label);
        $this->assertNull($movement->unit_cost);

        $entry = StockLotEntry::where('stock_movement_id', $movement->id)->sole();
        $this->assertSame($l2->id, $entry->stock_lot_id);
        $this->assertSame(3, $entry->qty);

        $this->assertSame(9, $item->fresh()->current_stock);
        $this->assertSame(9, $this->balance($item, 'A'));
        $this->assertLedger($item);
    }

    public function test_return_lands_where_the_lot_is_now(): void
    {
        $item = $this->item();
        [, $l2, $request] = $this->issuedTen($item);

        // L2 moves to B after the issue
        $transfer = StockMovement::create([
            'doc_no' => 'TRF-TEST-001', 'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 6,
            'from_label' => 'A', 'to_label' => 'B', 'moved_at' => now(),
        ]);
        $carried = app(StockLotService::class)->moveLot($l2, Warehouse::where('name', 'B')->value('id'), $transfer);
        app(StockBalanceService::class)->move($item, 'A', 'B', $carried);
        $this->assertSame(6, $this->balance($item, 'B'));

        $this->returnStock($item, $request, ['lots' => [['lot_id' => $l2->id, 'qty' => 4]]])->assertCreated();

        $this->assertSame(10, $this->balance($item, 'B'));
        $this->assertSame(0, $this->balance($item, 'A'));
        $this->assertSame(10, $l2->fresh()->qty_remaining);
        $this->assertSame('B', StockMovement::where('type', 'return')->sole()->to_label);
        $this->assertLedger($item);
    }

    public function test_return_to_lots_in_two_warehouses_shares_one_ret_number(): void
    {
        $item = $this->item();
        $la = $this->receive($item, 'A', '2026-08-01 10:00:00', ['qty' => 6]);
        $lb = $this->receive($item, 'B', '2026-08-02 10:00:00', ['qty' => 4]);
        $request = $this->fulfilled($item, 10, ['allocations' => [['warehouse' => 'A', 'qty' => 6], ['warehouse' => 'B', 'qty' => 4]]]);

        $response = $this->returnStock($item, $request, ['lots' => [
            ['lot_id' => $la->id, 'qty' => 2],
            ['lot_id' => $lb->id, 'qty' => 1],
        ]])->assertCreated();

        $rows = StockMovement::where('type', 'return')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(1, $rows->pluck('doc_no')->unique()->count());
        $this->assertMatchesRegularExpression('/^RET-\d{4}-\d{3,}$/', $rows->first()->doc_no);
        $this->assertSame(['A', 'B'], $rows->pluck('to_label')->all());
        $this->assertSame([2, 1], $rows->pluck('qty')->all());
        $this->assertSame([$request->id, $request->id], $rows->pluck('stock_request_id')->all());
        $response->assertJsonPath('data.id', $rows->first()->id);

        $this->assertSame(2, $la->fresh()->qty_remaining);
        $this->assertSame(1, $lb->fresh()->qty_remaining);
        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertLedger($item);
    }

    public function test_return_more_than_left_is_refused(): void
    {
        $item = $this->item();
        [, $l2, $request] = $this->issuedTen($item);
        $entries = StockLotEntry::count();

        $this->returnStock($item, $request, ['lots' => [['lot_id' => $l2->id, 'qty' => 5]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_lot_over')
            ->assertJsonPath('left', 4)
            ->assertJsonPath('lot_no', $l2->lot_no);

        // After a return of 3, only 1 is left on L2
        $this->returnStock($item, $request, ['lots' => [['lot_id' => $l2->id, 'qty' => 3]]])->assertCreated();
        $afterFirst = StockLotEntry::count();
        $this->returnStock($item, $request, ['lots' => [['lot_id' => $l2->id, 'qty' => 2]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_lot_over')
            ->assertJsonPath('left', 1);

        $this->assertSame($entries + 1, $afterFirst);
        $this->assertSame($afterFirst, StockLotEntry::count());
        $this->assertSame(1, StockMovement::where('type', 'return')->count());
        $this->assertSame(9, $l2->fresh()->qty_remaining);
        $this->assertLedger($item);
    }

    public function test_return_against_another_items_request_is_refused(): void
    {
        $item = $this->item();
        [, $l2] = $this->issuedTen($item);
        $other = $this->item();
        $this->receive($other, 'A', '2026-08-01 10:00:00', ['qty' => 5]);
        $othersRequest = $this->fulfilled($other, 2, ['from_warehouse' => 'A']);
        $entries = StockLotEntry::count();

        $this->returnStock($item, $othersRequest, ['lots' => [['lot_id' => $l2->id, 'qty' => 1]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_request_invalid');

        // A request that was never fulfilled has nothing to return
        $approved = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => 1, 'reason' => 'Use', 'status' => 'approved',
        ]);
        $this->returnStock($item, $approved, ['lots' => [['lot_id' => $l2->id, 'qty' => 1]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_request_invalid');

        $this->assertSame($entries, StockLotEntry::count());
        $this->assertSame(0, StockMovement::where('type', 'return')->count());
        $this->assertLedger($item);
        $this->assertLedger($other);
    }

    public function test_serial_return_only_takes_serials_issued_under_that_request(): void
    {
        $item = $this->item(true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['RS-1', 'RS-2', 'RS-3']]);
        $ids = StockItemSerial::whereIn('serial', ['RS-1', 'RS-2', 'RS-3'])->orderBy('serial')->pluck('id', 'serial');
        $first = $this->fulfilled($item, 1, ['serial_ids' => [$ids['RS-1']]]);
        $this->fulfilled($item, 1, ['serial_ids' => [$ids['RS-2']]]);

        // RS-2 went out under the other request, RS-3 never left
        foreach (['RS-2', 'RS-3'] as $serial) {
            $this->returnStock($item, $first, ['serial_ids' => [$ids[$serial]]])
                ->assertUnprocessable()
                ->assertJsonPath('message', 'return_serials_invalid');
        }

        $this->returnStock($item, $first, ['serial_ids' => [$ids['RS-1']]])->assertCreated();
        $this->assertDatabaseHas('stock_item_serials', [
            'id' => $ids['RS-1'], 'status' => 'in_stock', 'warehouse_id' => Warehouse::where('name', 'A')->value('id'),
        ]);
        $this->assertSame(2, $lot->fresh()->qty_remaining);

        // Already back
        $this->returnStock($item, $first, ['serial_ids' => [$ids['RS-1']]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_serials_invalid');

        $this->assertSame(1, StockMovement::where('type', 'return')->count());
        $this->assertSame('issued', StockItemSerial::find($ids['RS-2'])->status);
        $this->assertLedger($item);
    }

    public function test_return_does_not_take_a_destination_warehouse(): void
    {
        $item = $this->item();
        [, $l2, $request] = $this->issuedTen($item);

        $this->returnStock($item, $request, ['to_label' => 'B', 'lots' => [['lot_id' => $l2->id, 'qty' => 1]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('to_label');

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'lots' => [['lot_id' => $l2->id, 'qty' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('stock_request_id');

        $this->returnStock($item, $request, [])->assertUnprocessable()->assertJsonValidationErrors('lots');

        $this->assertSame(0, StockMovement::where('type', 'return')->count());
        $this->assertLedger($item);
    }

    public function test_return_dated_before_the_issue_is_refused(): void
    {
        $item = $this->item();
        [, $l2, $request] = $this->issuedTen($item);
        $issuedAt = StockMovement::where('type', 'issue')->where('stock_request_id', $request->id)->min('moved_at');

        $this->returnStock($item, $request, ['moved_at' => now()->subDay()->toDateTimeString(), 'lots' => [['lot_id' => $l2->id, 'qty' => 1]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'return_before_issue')
            ->assertJsonPath('date', (string) $issuedAt)
            ->assertJsonValidationErrors('moved_at');

        $this->assertSame(0, StockMovement::where('type', 'return')->count());

        // On or after the issue is fine
        $this->returnStock($item, $request, ['moved_at' => (string) $issuedAt, 'lots' => [['lot_id' => $l2->id, 'qty' => 1]]])->assertCreated();
        $this->assertLedger($item);
    }
}
