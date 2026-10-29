<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockReturnTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Warehouse::firstOrCreate(['name' => 'Main']);
    }

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** An approved request for $qty, fulfilled with the given payload. */
    private function fulfilledRequest(StockItem $item, int $qty, array $payload): StockRequest
    {
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'Wichai', 'qty' => $qty, 'reason' => 'use', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", $payload)->assertOk();

        return $req->fresh();
    }

    /**
     * Serialized item received (with cost), then one unit issued via a request.
     *
     * @return array{StockItem, StockRequest}
     */
    private function serializedWithOneIssued(): array
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // Receive 2 serials at unit cost 250 (into "Main").
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id,
            'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main', 'unit_cost' => 250,
        ])->assertCreated();

        // Issue SN-A out via an approved request.
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $req = $this->fulfilledRequest($item, 1, ['serial_ids' => [$snA]]);

        return [$item->fresh(), $req];
    }

    public function test_return_movement_detail_lists_the_returned_serials(): void
    {
        $this->actingAs($this->super());
        [$item, $req] = $this->serializedWithOneIssued();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snA],
        ])->assertCreated();

        $returnId = StockMovement::where('type', 'return')->value('id');

        // The movement-detail dialog reads this endpoint to list serials.
        $this->getJson("/api/stock-movements/{$returnId}/serials")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['SN-A']);
    }

    public function test_serialized_return_brings_issued_serial_back_in_stock(): void
    {
        $this->actingAs($this->super());
        [$item, $req] = $this->serializedWithOneIssued();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $lot = StockLot::where('stock_item_id', $item->id)->sole();

        // current_stock is 1 (SN-B in stock, SN-A issued).
        $this->assertSame(1, $item->current_stock);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snA],
        ])->assertCreated();

        // SN-A is back in stock, in "Main" (where its lot sits).
        $this->assertDatabaseHas('stock_item_serials', ['id' => $snA, 'status' => 'in_stock', 'warehouse_id' => Warehouse::where('name', 'Main')->value('id')]);
        // On-hand incremented back to 2.
        $this->assertSame(2, $item->fresh()->current_stock);
        // A 'returned' event linked to the return movement exists.
        $returnId = StockMovement::where('type', 'return')->value('id');
        $this->assertDatabaseHas('stock_item_serial_events', [
            'event' => 'returned', 'stock_movement_id' => $returnId, 'stock_item_serial_id' => $snA,
        ]);
        // SN-A went back into its own lot, which keeps the receive cost (250); no new lot is opened.
        $this->assertSame(1, StockLot::where('stock_item_id', $item->id)->count());
        $this->assertSame(2, $lot->fresh()->qty_remaining);
        $this->assertEquals(250, $lot->fresh()->unit_cost);
        $this->assertSame(1, StockLotEntry::where('stock_movement_id', $returnId)->where('stock_lot_id', $lot->id)->value('qty'));
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_return_rejects_a_serial_that_is_not_issued(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-2', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // SN-X is received and still in_stock (never issued) → cannot be "returned"; SN-Y went out under the request.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-X', 'SN-Y'], 'to_label' => 'Main',
        ])->assertCreated();
        $snX = StockItemSerial::where('serial', 'SN-X')->value('id');
        $snY = StockItemSerial::where('serial', 'SN-Y')->value('id');
        $req = $this->fulfilledRequest($item, 1, ['serial_ids' => [$snY]]);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snX],
        ])->assertStatus(422)->assertJsonValidationErrors('serial_ids');
    }

    public function test_serialized_return_without_serials_is_refused(): void
    {
        [$item, $req] = $this->serializedWithOneIssued();

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'return_serials_required')
            ->assertJsonValidationErrors('serial_ids');
    }

    public function test_return_requires_stock_return_permission(): void
    {
        [$item, $req] = $this->serializedWithOneIssued(); // set up as super inside helper
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snA],
        ])->assertForbidden();
    }

    public function test_qty_only_return_adds_stock_back_at_the_lots_cost(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'CBL-1', 'name' => 'Cable', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => false,
        ]);
        // Receive 10 @ 30, issue 2 via a request.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 30, 'to_label' => 'Main',
        ])->assertCreated();
        $lot = StockLot::where('stock_item_id', $item->id)->sole();
        $req = $this->fulfilledRequest($item, 2, ['from_warehouse' => 'Main']);

        // Return the 2 back into the lot they came from.
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id,
            'lots' => [['lot_id' => $lot->id, 'qty' => 2]],
        ])->assertCreated();

        $this->assertSame(10, $item->fresh()->current_stock);
        // The lot is refilled at its own cost (30); no new lot is opened, so the average stays 30.
        $this->assertSame(1, StockLot::where('stock_item_id', $item->id)->count());
        $this->assertSame(10, $lot->fresh()->qty_remaining);
        $this->assertEquals(30, $item->fresh()->avgCost());
        $this->assertNull(StockMovement::where('type', 'return')->sole()->unit_cost);
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_serialized_return_keeps_the_receive_cost_of_its_lot(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-3', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // Receive SN-A,SN-B,SN-C with cost 90 each (avg 90). Issue SN-A, then return it.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B', 'SN-C'], 'to_label' => 'Main', 'unit_cost' => 90,
        ])->assertCreated();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $req = $this->fulfilledRequest($item, 1, ['serial_ids' => [$snA]]);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snA],
        ])->assertCreated();

        // SN-A is back in its 90 lot: three units at 90.
        $lot = StockLot::where('stock_item_id', $item->id)->sole();
        $this->assertSame(3, $lot->qty_remaining);
        $this->assertEquals(90, $lot->unit_cost);
        $this->assertEquals(90, $item->fresh()->avgCost());
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_serialized_return_of_a_costless_receive_goes_back_into_its_own_lot(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-4', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // Two serialized receives: one costless (SN-N, unit_cost null), one costed (SN-C @ 100).
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-N'], 'to_label' => 'Main',
        ])->assertCreated();
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-C'], 'to_label' => 'Main', 'unit_cost' => 100,
        ])->assertCreated();
        $snN = StockItemSerial::where('serial', 'SN-N')->value('id');
        $costlessLot = StockLot::whereKey(StockItemSerial::whereKey($snN)->value('stock_lot_id'))->sole();
        $costBefore = (float) $costlessLot->unit_cost;
        $req = $this->fulfilledRequest($item, 1, ['serial_ids' => [$snN]]);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $req->id, 'serial_ids' => [$snN],
        ])->assertCreated();

        // SN-N refills its own lot at that lot's cost; no lot is opened at an average.
        $this->assertSame(2, StockLot::where('stock_item_id', $item->id)->count());
        $this->assertSame(1, $costlessLot->fresh()->qty_remaining);
        $this->assertEquals($costBefore, (float) $costlessLot->fresh()->unit_cost);
        $this->assertEquals(round(($costBefore + 100) / 2, 2), $item->fresh()->avgCost());
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }
}
