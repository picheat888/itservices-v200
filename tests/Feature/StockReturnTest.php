<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockReturnTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Serialized item received (with cost), then one unit issued via a request. */
    private function serializedWithOneIssued(): StockItem
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
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'Wichai', 'qty' => 1, 'reason' => 'use', 'status' => 'approved',
        ]);
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$snA]])->assertOk();

        return $item->fresh();
    }

    public function test_return_movement_detail_lists_the_returned_serials(): void
    {
        $this->actingAs($this->super());
        $item = $this->serializedWithOneIssued();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snA],
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
        $item = $this->serializedWithOneIssued();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        // current_stock is 1 (SN-B in stock, SN-A issued).
        $this->assertSame(1, $item->current_stock);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id,
            'from_label' => 'Wichai', 'to_label' => 'Main', 'serial_ids' => [$snA],
        ])->assertCreated();

        // SN-A is back in stock, in "Main".
        $this->assertDatabaseHas('stock_item_serials', ['id' => $snA, 'status' => 'in_stock', 'warehouse_id' => Warehouse::where('name', 'Main')->value('id')]);
        // On-hand incremented back to 2.
        $this->assertSame(2, $item->fresh()->current_stock);
        // A 'returned' event linked to the return movement exists.
        $returnId = StockMovement::where('type', 'return')->value('id');
        $this->assertDatabaseHas('stock_item_serial_events', [
            'event' => 'returned', 'stock_movement_id' => $returnId, 'stock_item_serial_id' => $snA,
        ]);
        // A FIFO lot was reopened at the original receive cost (250), not 0.
        $this->assertTrue(
            StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 250)->exists()
        );
    }

    public function test_return_rejects_a_serial_that_is_not_issued(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-2', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // SN-X is received and still in_stock (never issued) → cannot be "returned".
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-X'], 'to_label' => 'Main',
        ])->assertCreated();
        $snX = StockItemSerial::where('serial', 'SN-X')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snX],
        ])->assertStatus(422)->assertJsonValidationErrors('serial_ids');
    }

    public function test_return_requires_stock_return_permission(): void
    {
        $item = $this->serializedWithOneIssued(); // set up as super inside helper
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snA],
        ])->assertForbidden();
    }

    public function test_qty_only_return_adds_stock_at_average_cost(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'CBL-1', 'name' => 'Cable', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => false,
        ]);
        // Receive 10 @ 30 → avg cost 30.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 30, 'to_label' => 'Main',
        ])->assertCreated();

        // Return 2 back into stock (qty-only).
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'Main', 'from_label' => 'Somchai',
        ])->assertCreated();

        $this->assertSame(12, $item->fresh()->current_stock);
        // The return opened a lot at the average cost (30), not 0.
        $returnId = StockMovement::where('type', 'return')->value('id');
        $this->assertTrue(
            StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 30)->exists()
        );
    }

    public function test_serialized_return_of_costless_receive_values_at_pre_return_average(): void
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
        // Now there are 3 units valued at 90 each (avg 90). Issue SN-A, then return it.
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'X', 'qty' => 1, 'reason' => 'use', 'status' => 'approved',
        ]);
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$snA]])->assertOk();

        // SN-A's receive movement HAD a cost (90), so this returns at 90 via the original-cost path.
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snA],
        ])->assertCreated();

        $returnId = StockMovement::where('type', 'return')->value('id');
        // Lot reopened at the original receive cost 90 (not a stale-denominator value).
        $this->assertTrue(
            StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 90)->exists()
        );
    }

    public function test_serialized_return_with_null_original_cost_uses_pre_return_average(): void
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
        // Stock value = 0 (SN-N lot) + 100 (SN-C lot) = 100 over 2 units → avg 50.
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'X', 'qty' => 1, 'reason' => 'use', 'status' => 'approved',
        ]);
        $snN = StockItemSerial::where('serial', 'SN-N')->value('id');
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$snN]])->assertOk();
        // After issuing SN-N (the costless one, FIFO consumes the 0-cost lot first), 1 unit @100 remains → avg 100.
        // Return SN-N: its original cost is null → fallback must be the PRE-return average (100), not post-increment.
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snN],
        ])->assertCreated();
        $returnId = StockMovement::where('type', 'return')->value('id');
        // Pre-return avg is 100 (1 unit @100). Post-increment would wrongly give 100/2 = 50.
        $this->assertTrue(
            StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 100)->exists()
        );
    }
}
