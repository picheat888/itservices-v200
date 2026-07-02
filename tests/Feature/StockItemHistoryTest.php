<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function serialItem(string $sku): StockItem
    {
        return StockItem::create([
            'sku' => $sku, 'name' => $sku, 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
    }

    public function test_receiving_serials_logs_received_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $this->actingAs($this->super())
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id,
                'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('stock_item_serial_events', [
            'stock_item_id' => $item->id, 'event' => 'received', 'warehouse' => 'Main',
        ]);
        $this->assertSame(2, StockItemSerialEvent::where('event', 'received')->count());
    }

    public function test_transferring_serials_logs_transferred_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A'], 'to_label' => 'Main',
        ])->assertCreated();

        $serialId = $item->serials()->value('id');

        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id,
            'from_label' => 'Main', 'to_label' => 'HQ', 'serial_ids' => [$serialId],
        ])->assertCreated();

        $this->assertDatabaseHas('stock_item_serial_events', [
            'stock_item_serial_id' => $serialId, 'event' => 'transferred', 'from_label' => 'Main', 'to_label' => 'HQ',
        ]);
    }

    public function test_issuing_serials_logs_issued_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        $requester = User::factory()->create(['role' => 'user']);
        RolePermission::updateOrCreate(['role_id' => $requester->role_id, 'permission' => 'stock.request'], ['allowed' => true]);
        $reqId = $this->actingAs($requester)->postJson('/api/stock-requests', [
            'stock_item_id' => $item->id, 'qty' => 1, 'reason' => 'x',
        ])->assertCreated()->json('data.id');

        $this->actingAs($super)->postJson("/api/stock-requests/{$reqId}/approve")->assertOk();
        $serialId = $item->serials()->where('status', 'in_stock')->value('id');
        $this->actingAs($super)->postJson("/api/stock-requests/{$reqId}/fulfill", [
            'from_warehouse' => 'Main', 'serial_ids' => [$serialId],
        ])->assertOk();

        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $serialId, 'event' => 'issued']);
    }

    public function test_adjusting_serials_in_count_logs_adjusted_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        $count = $this->actingAs($super)->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->actingAs($super)->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();
        $missingId = $item->serials()->where('status', 'in_stock')->orderBy('id')->value('id');
        $this->actingAs($super)->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto', 'missing_serials' => [(string) $item->id => [$missingId]],
        ])->assertOk();

        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $missingId, 'event' => 'adjusted']);
    }

    public function test_history_endpoint_returns_movements_lots_and_serials(): void
    {
        $item = $this->serialItem('UPS-1');
        $this->actingAs($this->super())->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        $res = $this->actingAs($this->super())->getJson("/api/stock-items/{$item->id}/history")->assertOk();
        $res->assertJsonPath('data.item.sku', 'UPS-1');
        $res->assertJsonCount(1, 'data.movements');
        $res->assertJsonCount(2, 'data.serials');
        $res->assertJsonPath('data.serials.0.events.0.event', 'received');
    }

    public function test_history_requires_stock_view_permission(): void
    {
        $item = $this->serialItem('UPS-1');
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->getJson("/api/stock-items/{$item->id}/history")->assertForbidden();
    }
}
