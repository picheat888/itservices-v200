<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockMovement;
use App\Models\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockMovementSerialsTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_returns_serials_tied_to_a_receive_movement(): void
    {
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $this->actingAs($this->super())
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main'])
            ->assertCreated();

        $movementId = StockMovement::where('type', 'receive')->value('id');

        $this->getJson("/api/stock-movements/{$movementId}/serials")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['SN-A']);
    }

    public function test_returns_serials_tied_to_an_issue_movement_without_a_reference(): void
    {
        // A request with no external reference: the issue movement falls back to
        // "REQ-{id}" for its reference, so the issued serial events must use the
        // same fallback or the detail dialog shows an empty serial list.
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $this->actingAs($this->super());
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main'])
            ->assertCreated();

        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'A', 'qty' => 1, 'reason' => 'need', 'status' => 'approved',
        ]);
        $serialId = StockItemSerial::where('serial', 'SN-A')->value('id');

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'Main', 'serial_ids' => [$serialId]])
            ->assertOk();

        $movementId = StockMovement::where('type', 'issue')->value('id');

        // The issued serial event must be linked to its movement (not left to a
        // fragile reference match), so the detail dialog can list it.
        $this->assertDatabaseHas('stock_item_serial_events', [
            'event' => 'issued', 'stock_movement_id' => $movementId,
        ]);

        $this->getJson("/api/stock-movements/{$movementId}/serials")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['SN-A']);
    }

    public function test_split_issue_lists_only_each_warehouses_own_serials(): void
    {
        // One request drawn from two warehouses produces one issue movement per
        // warehouse; each must list only the serial it actually issued.
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $this->actingAs($this->super());
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A'], 'to_label' => 'WH-1'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-B'], 'to_label' => 'WH-2'])->assertCreated();

        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'A', 'qty' => 2, 'reason' => 'need', 'status' => 'approved',
        ]);
        $serialIds = StockItemSerial::whereIn('serial', ['SN-A', 'SN-B'])->pluck('id')->all();

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['serial_ids' => $serialIds])->assertOk();

        $wh1Move = StockMovement::where('type', 'issue')->where('from_label', 'WH-1')->value('id');
        $wh2Move = StockMovement::where('type', 'issue')->where('from_label', 'WH-2')->value('id');

        $this->getJson("/api/stock-movements/{$wh1Move}/serials")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonFragment(['SN-A']);
        $this->getJson("/api/stock-movements/{$wh2Move}/serials")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonFragment(['SN-B']);
    }

    public function test_requires_stock_view_permission(): void
    {
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $movement = StockMovement::create([
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1, 'moved_at' => now(), 'recorded_by' => 'x',
        ]);

        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->getJson("/api/stock-movements/{$movement->id}/serials")->assertForbidden();
    }
}
