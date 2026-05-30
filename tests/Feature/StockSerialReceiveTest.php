<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockSerialReceiveTest extends TestCase
{
    use RefreshDatabase;

    private function superUser(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** A serialized SKU (captures a serial for every unit). */
    private function serializedItem(int $current = 0): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-SN-'.fake()->unique()->numerify('###'),
            'name' => 'Serialized laptop',
            'track_serial' => true,
            'unit' => 'unit',
            'cost' => 1000,
            'current_stock' => $current,
            'min_stock' => 1,
            'max_stock' => 20,
            'warehouse' => 'WH-HQ',
        ]);
    }

    public function test_serialized_receive_registers_one_serial_per_unit(): void
    {
        $item = $this->serializedItem(0);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'qty' => 1, // ignored — quantity is driven by the serial list
                'serials' => ['SNA-001', 'SNA-002', 'SNA-003'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.qty', 3);

        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertDatabaseCount('stock_item_serials', 3);
        $this->assertDatabaseHas('stock_item_serials', [
            'stock_item_id' => $item->id,
            'serial' => 'SNA-001',
            'status' => 'in_stock',
        ]);
    }

    public function test_serialized_receive_rejects_duplicate_within_batch(): void
    {
        $item = $this->serializedItem();

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'qty' => 2,
                'serials' => ['DUP-1', 'dup-1'], // case-insensitive duplicate
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('serials');

        $this->assertDatabaseCount('stock_item_serials', 0);
    }

    public function test_serialized_receive_rejects_serial_already_in_system(): void
    {
        $item = $this->serializedItem();

        // First receive registers ABC-9.
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'serials' => ['ABC-9'],
            ])
            ->assertCreated();

        // Re-receiving the same serial is blocked.
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'serials' => ['abc-9'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('serials');

        $this->assertDatabaseCount('stock_item_serials', 1);
    }

    public function test_serialized_receive_requires_at_least_one_serial(): void
    {
        $item = $this->serializedItem();

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'qty' => 3,
                'serials' => [],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('serials');
    }

    public function test_show_endpoint_includes_per_unit_serials(): void
    {
        $item = $this->serializedItem();
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'serials' => ['VIEW-1', 'VIEW-2'],
            ])
            ->assertCreated();

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.track_serial', true)
            ->assertJsonCount(2, 'data.serials')
            ->assertJsonPath('data.serials.0.status', 'in_stock');
    }

    /** Receive helper: returns the created serial rows for an item. */
    private function receiveSerials(StockItem $item, array $serials): void
    {
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'serials' => $serials])->assertCreated();
    }

    public function test_direct_serialized_issue_is_rejected(): void
    {
        // Issuing is request-only — a direct 'issue' movement is not accepted,
        // and no serials change state.
        $item = $this->serializedItem();
        $this->actingAs($this->superUser());
        $this->receiveSerials($item, ['ISS-1', 'ISS-2', 'ISS-3']);

        $toIssue = StockItemSerial::whereIn('serial', ['ISS-1', 'ISS-2'])->pluck('id')->all();

        $this->postJson('/api/stock-movements', [
            'type' => 'issue',
            'stock_item_id' => $item->id,
            'qty' => 2,
            'serial_ids' => $toIssue,
        ])->assertUnprocessable()->assertJsonValidationErrors('type');

        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertSame(3, StockItemSerial::where('status', 'in_stock')->count());
    }

    public function test_serialized_fulfill_marks_chosen_serials_as_issued(): void
    {
        $item = $this->serializedItem();
        $this->actingAs($this->superUser());
        $this->receiveSerials($item, ['REQ-1', 'REQ-2']);

        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'A', 'qty' => 1, 'reason' => 'need', 'status' => 'approved',
        ]);
        $serialId = StockItemSerial::where('serial', 'REQ-1')->value('id');

        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$serialId]])
            ->assertOk()
            ->assertJsonPath('data.status', 'fulfilled');

        $this->assertSame(1, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_item_serials', ['id' => $serialId, 'status' => 'issued']);
    }

    public function test_serialized_fulfill_rejects_wrong_serial_count(): void
    {
        $item = $this->serializedItem();
        $this->actingAs($this->superUser());
        $this->receiveSerials($item, ['X-1', 'X-2']);
        $oneId = StockItemSerial::where('serial', 'X-1')->value('id');

        // Request needs 2 units but only one serial is chosen → rejected, nothing changes.
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'B', 'qty' => 2, 'reason' => 'need', 'status' => 'approved',
        ]);

        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$oneId]])
            ->assertUnprocessable();

        $this->assertSame(0, StockItemSerial::where('status', 'issued')->count());
        $this->assertSame(2, $item->fresh()->current_stock);
        $this->assertSame('approved', $req->fresh()->status);
    }

    public function test_serials_endpoint_lists_known_serials(): void
    {
        $item = $this->serializedItem();
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', [
                'type' => 'receive',
                'stock_item_id' => $item->id,
                'serials' => ['LIST-1', 'LIST-2'],
            ])
            ->assertCreated();

        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items/serials')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
