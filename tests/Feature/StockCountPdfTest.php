<?php

// Printable A4 landscape PDF of a confirmed count sheet: gating, 404 for drafts, and the rendered rows.

namespace Tests\Feature;

use App\Enums\Stock\StockCountAdjustMode;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Tests\TestCase;

class StockCountPdfTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $sku, int $stock, Warehouse $wh, bool $serial = false): StockItem
    {
        $item = StockItem::create(['sku' => $sku, 'name' => "Name {$sku}", 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => $serial]);
        $item->balances()->create(['warehouse_id' => $wh->id, 'qty' => $stock]);
        if ($serial) {
            for ($i = 1; $i <= $stock; $i++) {
                $item->serials()->create(['serial' => "{$sku}-SN{$i}", 'status' => 'in_stock', 'warehouse_id' => $wh->id]);
            }
        }

        return $item;
    }

    /** Opens a count over the items, fills the given payloads by sku, and optionally confirms it. */
    private function makeCount(Warehouse $wh, array $items, array $bySku, bool $commit): StockCount
    {
        $data = $this->postJson('/api/stock-counts', ['warehouse_id' => $wh->id, 'stock_item_ids' => collect($items)->pluck('id')->all()])
            ->assertCreated()->json('data');
        $lines = [];
        foreach ($data['lines'] as $line) {
            $lines[$line['id']] = $bySku[$line['sku']] ?? ['counted_qty' => null];
        }
        $this->putJson("/api/stock-counts/{$data['id']}", ['lines' => $lines])->assertOk();
        if ($commit) {
            $this->postJson("/api/stock-counts/{$data['id']}/commit", [])->assertOk();
        }

        return StockCount::findOrFail($data['id']);
    }

    public function test_confirmed_count_streams_a_pdf(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $short = $this->item('A-SHORT', 5, $wh, true);
        $same = $this->item('B-SAME', 5, $wh);
        $skipped = $this->item('C-SKIP', 4, $wh);
        $count = $this->makeCount($wh, [$short, $same, $skipped], [
            'A-SHORT' => ['counted_qty' => 4, 'reason' => 'lost', 'missing_serial_ids' => [$short->serials()->first()->id]],
            'B-SAME' => ['counted_qty' => 5],
        ], true);
        $seen = new \ArrayObject;
        View::composer('pdf.stock-count', fn ($v) => $seen->append($v->getData()));

        $res = $this->get("/pdf/stock-counts/{$count->id}");

        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringContainsString("StockCount_{$count->reference}", $res->headers->get('content-disposition'));
        $this->assertStringStartsWith('%PDF', $res->streamedContent());
        $rows = $seen[0]['rows'];
        $this->assertSame(['A-SHORT', 'B-SAME', 'C-SKIP'], array_column($rows, 'sku'));
        $this->assertSame('ของหาย', $rows[0]['reason']);
        $this->assertSame(['A-SHORT-SN1'], $rows[0]['missing_serials']);
        $this->assertSame(1, $seen[0]['totals']['short_lines']);
        $this->assertSame(1, $seen[0]['totals']['uncounted']);
    }

    public function test_confirmed_count_without_differences_renders(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->item('A-SAME', 3, $wh);
        $count = $this->makeCount($wh, [$item], ['A-SAME' => ['counted_qty' => 3]], true);

        $this->get("/pdf/stock-counts/{$count->id}")->assertOk();
    }

    public function test_draft_count_is_not_found(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->item('A-SAME', 3, $wh);
        $count = $this->makeCount($wh, [$item], ['A-SAME' => ['counted_qty' => 3]], false);

        $this->get("/pdf/stock-counts/{$count->id}")->assertNotFound();
    }

    public function test_manual_count_is_not_found(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->item('A-SHORT', 3, $wh);
        $count = $this->makeCount($wh, [$item], ['A-SHORT' => ['counted_qty' => 2, 'reason' => 'lost']], true);
        $count->update(['adjust_mode' => StockCountAdjustMode::Manual]);

        $this->get("/pdf/stock-counts/{$count->id}")->assertNotFound();
    }

    public function test_differing_row_without_reason_prints_a_dash(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $short = $this->item('A-SHORT', 3, $wh);
        $same = $this->item('B-SAME', 3, $wh);
        $count = $this->makeCount($wh, [$short, $same], [
            'A-SHORT' => ['counted_qty' => 2, 'reason' => 'lost'],
            'B-SAME' => ['counted_qty' => 3],
        ], true);
        $count->lines()->update(['reason' => null]);
        $seen = new \ArrayObject;
        View::composer('pdf.stock-count', fn ($v) => $seen->append($v->getData()));

        $this->get("/pdf/stock-counts/{$count->id}")->assertOk();

        $this->assertSame(['—', null], array_column($seen[0]['rows'], 'reason'));
    }

    public function test_requires_view_count_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $wh = Warehouse::create(['name' => 'Main']);
        $item = $this->item('A-SAME', 3, $wh);
        $count = $this->makeCount($wh, [$item], ['A-SAME' => ['counted_qty' => 3]], true);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->get("/pdf/stock-counts/{$count->id}")->assertForbidden();
    }
}
