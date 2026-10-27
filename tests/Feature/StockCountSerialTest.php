<?php

namespace Tests\Feature;

use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockCountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_show_lists_only_the_serials_of_the_counts_warehouse(): void
    {
        $item = $this->serialItem('UPS-1', 2, 'Main');
        $item->serials()->create(['serial' => 'UPS-1-SN9', 'status' => 'in_stock', 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Other'])->id]);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);

        $serials = $this->getJson("/api/stock-counts/{$count['id']}")->assertOk()->json('data.lines.0.serials');

        $this->assertSame(['UPS-1-SN1', 'UPS-1-SN2'], array_column($serials, 'serial'));
    }

    public function test_a_committed_count_names_its_missing_serials(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $other = $this->serialItem('UPS-2', 2);
        $missing = $item->serials()->orderBy('id')->first();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id, $other->id]);
        $lineOf = fn (StockItem $i) => collect($count['lines'])->firstWhere('stock_item_id', $i->id)['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [
            $lineOf($item) => ['missing_serial_ids' => [$missing->id], 'reason' => 'lost'],
            $lineOf($other) => ['missing_serial_ids' => []],
        ]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $lines = collect($this->getJson("/api/stock-counts/{$count['id']}")->assertOk()->json('data.lines'))->keyBy('stock_item_id');

        $this->assertSame([['id' => $missing->id, 'serial' => 'UPS-1-SN1']], $lines[$item->id]['missing_serials']);
        $this->assertSame([], $lines[$other->id]['missing_serials']);
    }

    public function test_missing_serial_numbers_load_in_one_query_for_the_whole_count(): void
    {
        $items = collect([1, 2, 3])->map(fn (int $n) => $this->serialItem("UPS-{$n}", 2));
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), $items->pluck('id')->all());
        $patch = collect($count['lines'])->mapWithKeys(fn (array $l) => [
            $l['id'] => ['missing_serial_ids' => [StockItem::find($l['stock_item_id'])->serials()->value('id')], 'reason' => 'lost'],
        ])->all();
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => $patch])->assertOk();

        DB::enableQueryLog();
        $this->getJson("/api/stock-counts/{$count['id']}")->assertOk();
        $serialNameQueries = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], 'stock_item_serials') && str_contains($q['query'], '"id" in'));

        $this->assertCount(1, $serialNameQueries);
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

    public function test_commit_marks_missing_serials_adjusted(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());

        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        // Counted 1 → short by 2; tick 2 serials as missing.
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$serials[0]->id, $serials[1]->id], 'reason' => 'lost']]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk()->assertJsonPath('data.status', 'committed');

        $this->assertSame(1, $item->fresh()->current_stock);
        $movement = StockMovement::where('stock_item_id', $item->id)->sole();
        $this->assertSame(['adjust_down', 2, 'lost'], [$movement->type, $movement->qty, $movement->reason]);
        $this->assertSame('adjusted', $serials[0]->fresh()->status);
        $this->assertSame('adjusted', $serials[1]->fresh()->status);
        $this->assertSame('in_stock', $serials[2]->fresh()->status);
        $this->assertSame($count['reference'], $serials[0]->fresh()->reference);
        $this->assertSame(2, StockItemSerialEvent::where('event', 'adjusted')->where('stock_movement_id', $movement->id)->count());
    }

    public function test_serial_commit_needs_no_mode(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => $item->serials()->orderBy('id')->limit(2)->pluck('id')->all(), 'reason' => 'broken']]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');
        $this->assertSame(1, $item->fresh()->current_stock);
        $this->assertSame(2, $item->serials()->where('status', 'adjusted')->count());
    }

    public function test_wrong_missing_count_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$serials[0]->id], 'reason' => 'lost']]])->assertOk();

        // One serial ticked in the draft, but the stored figure says two are short.
        StockCountLine::whereKey($lineId)->update(['counted_qty' => 1]);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_missing_mismatch')->assertJsonPath('need', 2)->assertJsonPath('sku', 'UPS-1');
        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_serial_from_another_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $other = $this->serialItem('UPS-2', 2);
        $otherSerial = $other->serials()->first();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$item->serials()->orderBy('id')->value('id')], 'reason' => 'lost']]])->assertOk();

        // The stored tick swapped for another item's serial behind the draft's back.
        StockCountLine::whereKey($lineId)->update(['missing_serial_ids' => json_encode([$otherSerial->id])]);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_missing_mismatch');
        $this->assertSame('in_stock', $otherSerial->fresh()->status);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_positive_variance_on_serialized_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        // Counted 5 > system 2 (a serialized sheet can only reach this by a stored figure).
        StockCountLine::whereKey($lineId)->update(['counted_qty' => 5, 'reason' => 'inbound']);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_over')->assertJsonPath('sku', 'UPS-1');
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

    // Review Focus 2: a ticked serial that left in_stock after the draft was saved
    public function test_ticked_serial_that_left_the_warehouse_refuses_commit(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->open(Warehouse::firstOrCreate(['name' => 'Main']), [$item->id]);
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$lineId => ['missing_serial_ids' => [$serials[0]->id], 'reason' => 'lost']]])->assertOk();
        $serials[0]->update(['status' => 'issued']);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_missing_mismatch')->assertJsonPath('sku', 'UPS-1');

        $this->assertSame('issued', $serials[0]->fresh()->status);
        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
        $this->assertSame(0, StockItemSerialEvent::where('event', 'adjusted')->count());
        $this->assertSame('draft', StockCount::find($count['id'])->status->value);
    }

    /** Commit an original count that writes $missing off, then open its recount. */
    private function recountAfterWriteOff(StockItem $item, array $missing, User $user): StockCount
    {
        $service = app(StockCountService::class);
        $warehouse = Warehouse::firstOrCreate(['name' => 'Main']);
        $original = $service->open($warehouse, [$item->id], $user);
        $service->saveLines($original, [$original->lines->first()->id => ['missing_serial_ids' => $missing, 'reason' => 'lost']]);
        $service->commit($original->fresh(), $user);

        return $service->open($warehouse, [$item->id], $user, $original->fresh());
    }

    public function test_a_found_serial_on_a_recount_returns_to_stock(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $lost = $item->serials()->orderBy('id')->first();
        $user = $this->super();
        $recount = $this->recountAfterWriteOff($item, [$lost->id], $user);
        $this->assertSame(2, $recount->lines->first()->system_qty);
        app(StockCountService::class)->saveLines($recount, [$recount->lines->first()->id => ['found_serial_ids' => [$lost->id], 'reason' => 'miscount']]);

        app(StockCountService::class)->commit($recount->fresh(), $user);

        $this->assertSame(['in_stock', $recount->reference], [$lost->fresh()->status, $lost->fresh()->reference]);
        $this->assertSame(3, $item->fresh()->current_stock);
        $up = StockMovement::where('type', 'adjust_up')->sole();
        $this->assertSame([1, 'miscount', $recount->reference, 'ADJ-'.now()->year.'-002'], [$up->qty, $up->reason, $up->reference, $up->doc_no]);
        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $lost->id, 'event' => 'found', 'stock_movement_id' => $up->id, 'reference' => $recount->reference]);
    }

    public function test_a_net_zero_serial_line_logs_events_without_a_movement(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        [$lost, $present] = $item->serials()->orderBy('id')->limit(2)->get()->all();
        $user = $this->super();
        $recount = $this->recountAfterWriteOff($item, [$lost->id], $user);
        app(StockCountService::class)->saveLines($recount, [$recount->lines->first()->id => [
            'found_serial_ids' => [$lost->id], 'missing_serial_ids' => [$present->id],
        ]]);
        $movements = StockMovement::count();

        app(StockCountService::class)->commit($recount->fresh(), $user);

        $this->assertSame($movements, StockMovement::count());
        $this->assertSame(2, $item->fresh()->current_stock);
        $this->assertSame(['in_stock', 'adjusted'], [$lost->fresh()->status, $present->fresh()->status]);
        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $lost->id, 'event' => 'found', 'stock_movement_id' => null]);
        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $present->id, 'event' => 'adjusted', 'reference' => $recount->reference]);
    }
}
