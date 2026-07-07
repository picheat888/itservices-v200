<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountSerialTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** A serialized item with $stock in-stock serial units parked in $wh. */
    private function serialItem(string $sku, int $stock, string $wh = 'Main'): StockItem
    {
        $item = StockItem::create([
            'sku' => $sku, 'name' => $sku, 'unit' => 'pcs',
            'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $whId = Warehouse::firstOrCreate(['name' => $wh])->id;
        $item->balances()->create(['warehouse_id' => $whId, 'qty' => $stock]);
        for ($i = 1; $i <= $stock; $i++) {
            $item->serials()->create(['serial' => "{$sku}-SN{$i}", 'status' => 'in_stock', 'warehouse_id' => $whId]);
        }

        return $item;
    }

    public function test_show_returns_track_serial_and_in_stock_serials(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');

        $this->getJson("/api/stock-counts/{$count['id']}")
            ->assertOk()
            ->assertJsonPath('data.lines.0.track_serial', true)
            ->assertJsonCount(3, 'data.lines.0.serials')
            ->assertJsonPath('data.lines.0.serials.0.serial', 'UPS-1-SN1');
    }

    public function test_open_snapshots_in_stock_serial_count_for_serialized_items(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        // Drift current_stock away from the 3 in-stock serials (the bug condition seen in real data).
        $item->update(['current_stock' => 99]);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');

        // System reflects the 3 in-stock serials, not current_stock (99).
        $this->assertSame(3, $count['lines'][0]['system_qty']);
    }

    public function test_auto_commit_marks_missing_serials_adjusted(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        // Counted 1 → short by 2; tick 2 serials as missing.
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $missing = [$serials[0]->id, $serials[1]->id];
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => $missing],
        ])->assertOk()->assertJsonPath('data.status', 'committed');

        $this->assertSame(1, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 2]);
        $this->assertSame('adjusted', $serials[0]->fresh()->status);
        $this->assertSame('adjusted', $serials[1]->fresh()->status);
        $this->assertSame('in_stock', $serials[2]->fresh()->status);
    }

    public function test_manual_commit_blocked_when_serialized_item_present(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])->assertStatus(422);
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_wrong_missing_count_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        // Short by 2 but only 1 serial ticked.
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$serials[0]->id]],
        ])->assertStatus(422);
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_serial_from_another_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $other = $this->serialItem('UPS-2', 2);
        $otherSerial = $other->serials()->first();
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$otherSerial->id]],
        ])->assertStatus(422);
    }

    public function test_positive_variance_on_serialized_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        // Counted 5 > system 2.
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 5]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => []],
        ])->assertStatus(422);
    }
}
