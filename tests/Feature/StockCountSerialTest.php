<?php

namespace Tests\Feature;

use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockCountService;
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

    /** Open a count of one warehouse; returns the created count payload. */
    private function open(Warehouse $warehouse, array $itemIds): array
    {
        return $this->postJson('/api/stock-counts', ['warehouse_id' => $warehouse->id, 'stock_item_ids' => $itemIds])
            ->assertCreated()->json('data');
    }

    public function test_show_returns_track_serial_and_in_stock_serials(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);

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

        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);

        // System reflects the 3 in-stock serials, not current_stock (99).
        $this->assertSame(3, $count['lines'][0]['system_qty']);
    }

    public function test_auto_commit_marks_missing_serials_adjusted(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());

        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        // Counted 1 → short by 2; tick 2 serials as missing.
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$serials[0]->id, $serials[1]->id]]]])->assertOk();

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
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => $item->serials()->orderBy('id')->limit(2)->pluck('id')->all()]]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'count_serial_needs_auto');
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_wrong_missing_count_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$serials[0]->id]]]])->assertOk();

        // One serial ticked in the draft, two sent at commit.
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$serials[0]->id, $serials[1]->id]],
        ])->assertStatus(422)->assertJsonPath('message', 'count_serial_missing_mismatch')->assertJsonPath('need', 1)->assertJsonPath('sku', 'UPS-1');
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_serial_from_another_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $other = $this->serialItem('UPS-2', 2);
        $otherSerial = $other->serials()->first();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$item->serials()->orderBy('id')->value('id')]]]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$otherSerial->id]],
        ])->assertStatus(422);
    }

    public function test_positive_variance_on_serialized_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        // Counted 5 > system 2 (a serialized sheet can only reach this by a stored figure).
        StockCountLine::whereKey($lineId)->update(['counted_qty' => 5]);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => []],
        ])->assertStatus(422)->assertJsonPath('message', 'count_serial_over')->assertJsonPath('sku', 'UPS-1');
    }

    public function test_serial_system_qty_counts_this_warehouse_serials(): void
    {
        $item = $this->serialItem('UPS-1', 2, 'Main');
        $otherId = Warehouse::firstOrCreate(['name' => 'Other'])->id;
        $item->serials()->create(['serial' => 'UPS-1-SN9', 'status' => 'in_stock', 'warehouse_id' => $otherId]);
        $this->actingAs($this->super());

        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);

        $this->assertSame(2, $count['lines'][0]['system_qty']);
    }

    public function test_serial_line_qty_comes_from_ticks(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => 99, 'missing_serial_ids' => [$serials[0]->id]]]])
            ->assertOk()
            ->assertJsonPath('data.lines.0.counted_qty', 2)
            ->assertJsonPath('data.lines.0.missing_serial_ids', [$serials[0]->id]);
    }

    public function test_an_empty_tick_list_counts_every_serial_present(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => []]]])
            ->assertOk()->assertJsonPath('data.lines.0.counted_qty', 3);
    }

    public function test_clearing_a_serial_line_clears_its_ticks(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$item->serials()->value('id')]]]])->assertOk();

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['counted_qty' => null]]])
            ->assertOk()
            ->assertJsonPath('data.lines.0.counted_qty', null)
            ->assertJsonPath('data.lines.0.missing_serial_ids', []);
    }

    public function test_missing_serial_of_another_warehouse_is_refused(): void
    {
        $item = $this->serialItem('UPS-1', 2, 'Main');
        $elsewhere = $item->serials()->create([
            'serial' => 'UPS-1-SN9', 'status' => 'in_stock', 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Other'])->id,
        ]);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$elsewhere->id]]]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here')->assertJsonPath('sku', 'UPS-1');
    }

    public function test_missing_serial_of_another_item_is_refused_in_the_draft(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $other = $this->serialItem('UPS-2', 2);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$other->serials()->value('id')]]]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here');
    }

    public function test_a_found_serial_on_a_count_that_is_not_a_recount_is_refused(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $adjusted = $item->serials()->create([
            'serial' => 'UPS-1-SN9', 'status' => 'adjusted', 'reference' => 'SC-2026-001',
            'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Main'])->id,
        ]);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['found_serial_ids' => [$adjusted->id]]]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here');
    }

    public function test_a_found_serial_of_the_original_count_is_accepted_on_a_recount(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $warehouse = Warehouse::firstOrCreate(['name' => 'Main']);
        $user = $this->super();
        $original = app(StockCountService::class)->open($warehouse, [$item->id], $user);
        $original->update(['status' => 'committed']);
        $adjusted = $item->serials()->create([
            'serial' => 'UPS-1-SN9', 'status' => 'adjusted', 'reference' => $original->reference, 'warehouse_id' => $warehouse->id,
        ]);
        $unrelated = $item->serials()->create([
            'serial' => 'UPS-1-SN8', 'status' => 'adjusted', 'reference' => 'SC-2020-999', 'warehouse_id' => $warehouse->id,
        ]);
        $recount = app(StockCountService::class)->open($warehouse, [$item->id], $user, $original);
        $lineId = $recount->lines->first()->id;
        $this->actingAs($user);

        $this->putJson("/api/stock-counts/{$recount->id}", ['lines' => [$lineId => ['found_serial_ids' => [$unrelated->id]]]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here');
        $this->putJson("/api/stock-counts/{$recount->id}", ['lines' => [$lineId => ['found_serial_ids' => [$adjusted->id]]]])
            ->assertOk()
            ->assertJsonPath('data.lines.0.counted_qty', 3)
            ->assertJsonPath('data.lines.0.found_serial_ids', [$adjusted->id]);
    }
}
