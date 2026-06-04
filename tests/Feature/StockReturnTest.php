<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockLot;
use App\Models\StockMovement;
use App\Models\StockRequest;
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
        $this->assertDatabaseHas('stock_item_serials', ['id' => $snA, 'status' => 'in_stock', 'warehouse' => 'Main']);
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
}
