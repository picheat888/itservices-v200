<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockHistoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['Main', 'HQ'] as $name) {
            Warehouse::firstOrCreate(['name' => $name]);
        }
    }

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
            'from_label' => 'Main', 'to_label' => 'HQ', 'lot_ids' => [$item->serials()->value('stock_lot_id')],
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

        $count = $this->actingAs($super)->postJson('/api/stock-counts', ['warehouse_id' => Warehouse::firstOrCreate(['name' => 'Main'])->id, 'stock_item_ids' => [$item->id]])->assertCreated()->json('data');
        $lineId = $count['lines'][0]['id'];
        $missingId = $item->serials()->where('status', 'in_stock')->orderBy('id')->value('id');
        $this->actingAs($super)->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$missingId], 'reason' => 'lost']]])->assertOk();
        $this->actingAs($super)->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

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

    public function test_a_lot_opened_by_a_real_count_carries_its_reason_in_the_item_detail(): void
    {
        $warehouse = Warehouse::firstOrCreate(['name' => 'Main']);
        $item = StockItem::create(['sku' => 'CNT-2', 'name' => 'CNT-2', 'unit' => 'pcs', 'current_stock' => 10, 'min_stock' => 1, 'max_stock' => 100]);
        $item->balances()->create(['warehouse_id' => $warehouse->id, 'qty' => 10]);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', ['warehouse_id' => $warehouse->id, 'stock_item_ids' => [$item->id]])
            ->assertCreated()->json('data');
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['counted_qty' => 12, 'reason' => 'inbound']]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $movement = StockMovement::where('stock_item_id', $item->id)->where('type', 'adjust_up')->firstOrFail();
        $this->assertSame($movement->id, StockLot::where('stock_item_id', $item->id)->firstOrFail()->stock_movement_id);
        $this->getJson("/api/stock-items/{$item->id}")->assertOk()
            ->assertJsonPath('data.lots.0.reason', 'inbound')
            ->assertJsonPath('data.lots.0.notes', null);
    }

    public function test_history_requires_stock_view_permission(): void
    {
        $item = $this->serialItem('UPS-1');
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->getJson("/api/stock-items/{$item->id}/history")->assertForbidden();
    }

    public function test_history_names_the_recorder_in_thai_too(): void
    {
        $item = $this->serialItem('UPS-1');
        $employee = Employee::create(['code' => 'EMP-H1', 'first_name' => 'Somchai', 'last_name' => 'Store', 'first_name_th' => 'สมชาย', 'last_name_th' => 'คลัง']);
        $super = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A'], 'to_label' => 'Main',
        ])->assertCreated();

        $history = $this->actingAs($super)->getJson("/api/stock-items/{$item->id}/history")->assertOk()->json('data');

        $this->assertSame('สมชาย คลัง', $history['movements'][0]['recorded_by_th']);
        $this->assertSame('สมชาย คลัง', $history['serials'][0]['events'][0]['recorded_by_th']);
        $this->actingAs($super)->getJson("/api/stock-items/{$item->id}")->assertJsonPath('data.lots.0.recorded_by_th', 'สมชาย คลัง');
    }

    /**
     * @param  array<string, mixed>  $movement
     * @return array<int, array<string, mixed>>
     */
    private function historyRowsFor(array $movement): array
    {
        $item = $this->serialItem('CNT-1');
        StockMovement::create($movement + [
            'type' => 'adjust_down', 'stock_item_id' => $item->id, 'qty' => 1, 'moved_at' => now(),
        ]);

        return app(StockHistoryService::class)->build($item)['movements']->all();
    }

    public function test_history_note_shows_the_count_reason(): void
    {
        $rows = $this->historyRowsFor(['reason' => 'used', 'notes' => null]);
        $this->assertSame('Issued but not recorded', $rows[0]['notes']);
        $this->assertSame('used', $rows[0]['reason']);
    }

    public function test_history_note_keeps_the_typed_text_for_a_custom_reason(): void
    {
        $rows = $this->historyRowsFor(['reason' => 'custom', 'notes' => 'Box dropped']);
        $this->assertSame('Box dropped', $rows[0]['notes']);
    }

    public function test_history_note_of_an_old_movement_is_unchanged(): void
    {
        $rows = $this->historyRowsFor(['notes' => 'Stock count adjustment']);
        $this->assertSame('Stock count adjustment', $rows[0]['notes']);
        $this->assertNull($rows[0]['reason']);
    }
}
