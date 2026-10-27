<?php

// Recount of a confirmed sheet: mismatched rows only, refusals, and lost serials ticked back.

namespace Tests\Feature;

use App\Enums\Stock\StockCountAdjustMode;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountRecountTest extends TestCase
{
    use RefreshDatabase;

    private function plainItem(string $sku, int $stock, Warehouse $wh): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100]);
        $item->balances()->create(['warehouse_id' => $wh->id, 'qty' => $stock]);

        return $item;
    }

    private function serialItem(string $sku, int $stock, Warehouse $wh): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true]);
        $item->balances()->create(['warehouse_id' => $wh->id, 'qty' => $stock]);
        for ($i = 1; $i <= $stock; $i++) {
            $item->serials()->create(['serial' => "{$sku}-SN{$i}", 'status' => 'in_stock', 'warehouse_id' => $wh->id]);
        }

        return $item;
    }

    /**
     * Open, fill and confirm a count; $bySku maps each sku to its line payload.
     *
     * @param  list<StockItem>  $items
     * @param  array<string, array<string, mixed>>  $bySku
     * @return array<string, mixed>
     */
    private function confirmedCount(Warehouse $wh, array $items, array $bySku): array
    {
        $count = $this->postJson('/api/stock-counts', ['warehouse_id' => $wh->id, 'stock_item_ids' => collect($items)->pluck('id')->all()])
            ->assertCreated()->json('data');
        $lines = [];
        foreach ($count['lines'] as $line) {
            $lines[$line['id']] = $bySku[$line['sku']];
        }
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => $lines])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        return $count;
    }

    public function test_recount_opens_a_draft_of_the_mismatched_rows_only(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $short = $this->plainItem('A-SHORT', 5, $wh);
        $over = $this->plainItem('B-OVER', 5, $wh);
        $same = $this->plainItem('C-SAME', 5, $wh);
        $original = $this->confirmedCount($wh, [$short, $over, $same], [
            'A-SHORT' => ['counted_qty' => 3, 'reason' => 'lost'],
            'B-OVER' => ['counted_qty' => 7, 'reason' => 'miscount'],
            'C-SAME' => ['counted_qty' => 5],
        ]);

        $response = $this->postJson("/api/stock-counts/{$original['id']}/recount")->assertCreated();

        $response->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.warehouse_id', $wh->id)
            ->assertJsonPath('data.recount_of.reference', $original['reference'])
            ->assertJsonCount(2, 'data.lines');
        $bySku = collect($response->json('data.lines'))->keyBy('sku');
        $this->assertSame(['A-SHORT', 'B-OVER'], $bySku->keys()->sort()->values()->all());
        // Re-snapshotted after the original adjusted the stock
        $this->assertSame(3, $bySku['A-SHORT']['system_qty']);
        $this->assertSame(7, $bySku['B-OVER']['system_qty']);
    }

    public function test_recount_refuses_draft_and_manual_and_no_difference(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->plainItem('A', 5, $wh);

        $draft = $this->postJson('/api/stock-counts', ['warehouse_id' => $wh->id, 'stock_item_ids' => [$item->id]])->json('data');
        $this->postJson("/api/stock-counts/{$draft['id']}/recount")->assertStatus(422)->assertJsonPath('message', 'count_recount_not_committed');
        StockCount::whereKey($draft['id'])->update(['status' => 'canceled']);

        $manual = $this->confirmedCount($wh, [$item], ['A' => ['counted_qty' => 4, 'reason' => 'lost']]);
        StockCount::whereKey($manual['id'])->update(['adjust_mode' => StockCountAdjustMode::Manual]);
        $this->postJson("/api/stock-counts/{$manual['id']}/recount")->assertStatus(422)->assertJsonPath('message', 'count_recount_not_committed');

        $matching = $this->confirmedCount($wh, [$item], ['A' => ['counted_qty' => 4]]);
        $this->postJson("/api/stock-counts/{$matching['id']}/recount")->assertStatus(422)->assertJsonPath('message', 'count_recount_nothing');

        $noWarehouse = $this->confirmedCount($wh, [$item], ['A' => ['counted_qty' => 3, 'reason' => 'lost']]);
        StockCount::whereKey($noWarehouse['id'])->update(['warehouse_id' => null]);
        $this->postJson("/api/stock-counts/{$noWarehouse['id']}/recount")->assertStatus(422)->assertJsonPath('message', 'count_needs_warehouse');
    }

    public function test_recount_of_all_matching_is_refused(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $a = $this->plainItem('A', 5, $wh);
        $b = $this->plainItem('B', 2, $wh);
        $original = $this->confirmedCount($wh, [$a, $b], ['A' => ['counted_qty' => 5], 'B' => ['counted_qty' => 2]]);

        $this->postJson("/api/stock-counts/{$original['id']}/recount")
            ->assertStatus(422)->assertJsonPath('message', 'count_recount_nothing');
        $this->assertSame(1, StockCount::count());
    }

    /**
     * The original count writes serial 1 off; returns [item, lost serial, original, recount payload].
     *
     * @return array{0: StockItem, 1: StockItemSerial, 2: array<string, mixed>, 3: array<string, mixed>}
     */
    private function lostSerialScenario(): array
    {
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->serialItem('UPS', 3, $wh);
        $lost = $item->serials()->orderBy('id')->first();
        $original = $this->confirmedCount($wh, [$item], ['UPS' => ['missing_serial_ids' => [$lost->id], 'reason' => 'lost']]);
        $recount = $this->postJson("/api/stock-counts/{$original['id']}/recount")->assertCreated()->json('data');

        return [$item, $lost, $original, $recount];
    }

    public function test_found_serial_returns_to_stock(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        [$item, $lost, , $recount] = $this->lostSerialScenario();
        $line = $recount['lines'][0];
        $this->assertSame([['id' => $lost->id, 'serial' => $lost->serial]], $line['lost_serials']);

        $this->putJson("/api/stock-counts/{$recount['id']}", ['lines' => [$line['id'] => ['found_serial_ids' => [$lost->id], 'reason' => 'miscount']]])->assertOk();
        $this->postJson("/api/stock-counts/{$recount['id']}/commit", [])->assertOk();

        $this->assertSame('in_stock', $lost->fresh()->status);
        $this->assertSame($recount['reference'], $lost->fresh()->reference);
        $movement = StockMovement::where('reference', $recount['reference'])->sole();
        $this->assertSame(['adjust_up', 1], [$movement->type, $movement->qty]);
        $this->assertSame(1, StockItemSerialEvent::where('event', 'found')->where('stock_movement_id', $movement->id)->count());
        $this->assertSame(3, $item->fresh()->current_stock);
        $this->assertSame(3, (int) $item->balances()->value('qty'));
    }

    public function test_found_serial_from_another_count_is_refused(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        [$item, , , $recount] = $this->lostSerialScenario();
        $other = $item->serials()->orderBy('id')->skip(1)->first();
        $other->update(['status' => 'adjusted', 'reference' => 'SC-OTHER-001']);

        $this->putJson("/api/stock-counts/{$recount['id']}", ['lines' => [$recount['lines'][0]['id'] => ['found_serial_ids' => [$other->id], 'reason' => 'miscount']]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here');
    }

    public function test_lost_serial_received_again_is_not_offered(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        [, $lost, , $recount] = $this->lostSerialScenario();
        StockItemSerial::whereKey($lost->id)->update(['status' => 'in_stock']);

        $shown = $this->getJson("/api/stock-counts/{$recount['id']}")->assertOk()->json('data.lines.0.lost_serials');
        $this->assertSame([], $shown);
        $this->putJson("/api/stock-counts/{$recount['id']}", ['lines' => [$recount['lines'][0]['id'] => ['found_serial_ids' => [$lost->id], 'reason' => 'miscount']]])
            ->assertStatus(422)->assertJsonPath('message', 'count_serial_not_here');
    }
}
