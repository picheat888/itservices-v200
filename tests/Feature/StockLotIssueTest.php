<?php

// Fulfilling a request: one ISS number per request, FIFO lot draws per warehouse, rows linked to the request.

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Stock\StockIssueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\AssertsLotLedger;
use Tests\TestCase;

class StockLotIssueTest extends TestCase
{
    use AssertsLotLedger;
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();

        Warehouse::create(['name' => 'A']);
        Warehouse::create(['name' => 'B']);
        $this->super = User::factory()->create(['role' => 'super']);
        $this->actingAs($this->super);
    }

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-ISS-'.fake()->unique()->numerify('###'),
            'name' => 'Issue item',
            'unit' => 'unit',
            'cost' => 100,
            'track_serial' => $serial,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function receive(StockItem $item, string $warehouse, string $movedAt, array $extra = []): StockLot
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'to_label' => $warehouse, 'moved_at' => $movedAt, ...$extra,
        ])->assertCreated();

        return StockLot::where('stock_item_id', $item->id)->latest('id')->firstOrFail();
    }

    /** The Task 2 FIFO fixture: A holds 6 (Aug) + 21 (Sep), B holds 5 (Jul). */
    private function fifoFixture(StockItem $item): array
    {
        return [
            'a1' => $this->receive($item, 'A', '2026-08-12 10:00:00', ['qty' => 6]),
            'a2' => $this->receive($item, 'A', '2026-09-30 10:00:00', ['qty' => 21]),
            'b1' => $this->receive($item, 'B', '2026-07-01 10:00:00', ['qty' => 5]),
        ];
    }

    private function approvedRequest(StockItem $item, int $qty): StockRequest
    {
        return StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => $qty, 'reason' => 'Use', 'status' => 'approved',
        ]);
    }

    public function test_one_request_across_two_warehouses_gets_one_iss_number(): void
    {
        $item = $this->item();
        $this->fifoFixture($item);
        $request = $this->approvedRequest($item, 10);

        $response = $this->postJson("/api/stock-requests/{$request->id}/fulfill", [
            'allocations' => [['warehouse' => 'A', 'qty' => 6], ['warehouse' => 'B', 'qty' => 4]],
        ])->assertOk()->assertJsonPath('data.status', 'fulfilled');

        $rows = StockMovement::where('type', 'issue')->where('stock_item_id', $item->id)->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(1, $rows->pluck('doc_no')->unique()->count());
        $docNo = $rows->first()->doc_no;
        $this->assertMatchesRegularExpression('/^ISS-\d{4}-\d{3,}$/', $docNo);
        $this->assertSame([$request->id, $request->id], $rows->pluck('stock_request_id')->all());
        $this->assertSame([$request->reference, $request->reference], $rows->pluck('reference')->all());
        $this->assertSame(['A', 'B'], $rows->pluck('from_label')->all());

        $response->assertJsonPath('data.issue_doc_no', $docNo)
            ->assertJsonPath('issue.doc_no', $docNo);
        $this->assertSame(
            [['warehouse' => 'A', 'qty' => 6], ['warehouse' => 'B', 'qty' => 4]],
            collect($response->json('issue.lines'))->map(fn (array $line) => ['warehouse' => $line['warehouse'], 'qty' => $line['qty']])->all(),
        );

        // A second request takes the next number
        $next = $this->approvedRequest($item, 2);
        $this->postJson("/api/stock-requests/{$next->id}/fulfill", ['from_warehouse' => 'A'])->assertOk();
        $nextDocNo = StockMovement::where('stock_request_id', $next->id)->sole()->doc_no;
        $this->assertSame((int) substr($docNo, -3) + 1, (int) substr($nextDocNo, -3));

        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_issue_draws_the_oldest_lot_of_each_warehouse(): void
    {
        $item = $this->item();
        ['a1' => $a1, 'a2' => $a2, 'b1' => $b1] = $this->fifoFixture($item);
        $request = $this->approvedRequest($item, 10);

        $response = $this->postJson("/api/stock-requests/{$request->id}/fulfill", [
            'allocations' => [['warehouse' => 'A', 'qty' => 10]],
        ])->assertOk();

        $this->assertSame(0, $a1->fresh()->qty_remaining);
        $this->assertSame(17, $a2->fresh()->qty_remaining);
        $this->assertSame(5, $b1->fresh()->qty_remaining);

        $movement = StockMovement::where('stock_request_id', $request->id)->sole();
        $draws = StockLotEntry::where('qty', '<', 0)->orderBy('id')->get();
        $this->assertSame([$a1->id, $a2->id], $draws->pluck('stock_lot_id')->all());
        $this->assertSame([-6, -4], $draws->pluck('qty')->all());
        $this->assertSame([$movement->id, $movement->id], $draws->pluck('stock_movement_id')->all());

        $response->assertJsonPath('issue.lines.0.lot_id', $a1->id)
            ->assertJsonPath('issue.lines.0.lot_no', $a1->lot_no)
            ->assertJsonPath('issue.lines.0.qty', 6)
            ->assertJsonPath('issue.lines.1.lot_id', $a2->id)
            ->assertJsonPath('issue.lines.1.qty', 4);

        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_serial_issue_draws_the_lots_of_the_picked_serials(): void
    {
        $item = $this->item(true);
        $l1 = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['LS-1', 'LS-2']]);
        $l2 = $this->receive($item, 'A', '2026-09-01 10:00:00', ['serials' => ['LS-3', 'LS-4']]);
        $request = $this->approvedRequest($item, 2);
        $picked = StockItemSerial::whereIn('serial', ['LS-2', 'LS-4'])->pluck('id')->all();

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['serial_ids' => $picked])->assertOk();

        $movement = StockMovement::where('stock_request_id', $request->id)->sole();
        $draws = StockLotEntry::where('qty', '<', 0)->orderBy('stock_lot_id')->get();
        $this->assertSame([$l1->id, $l2->id], $draws->pluck('stock_lot_id')->all());
        $this->assertSame([-1, -1], $draws->pluck('qty')->all());
        $this->assertSame([$movement->id, $movement->id], $draws->pluck('stock_movement_id')->all());
        $this->assertSame(['issued', 'issued'], StockItemSerial::whereIn('id', $picked)->pluck('status')->all());

        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }

    public function test_two_fulfils_of_one_request_book_once(): void
    {
        $item = $this->item();
        $this->fifoFixture($item);
        $request = $this->approvedRequest($item, 3);
        $stale = StockRequest::findOrFail($request->id);

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'A'])->assertOk();
        $entries = StockLotEntry::count();

        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'A'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'request_wrong_status');

        // A racing fulfil that read the row before the first one committed is stopped by the service lock
        try {
            app(StockIssueService::class)->fulfil($stale, $this->super, ['from_warehouse' => 'A']);
            $this->fail('A second fulfil of the same request was booked.');
        } catch (ValidationException $e) {
            $this->assertSame('request_wrong_status', $e->getMessage());
        }

        $this->assertSame($entries, StockLotEntry::count());
        $this->assertSame(1, StockMovement::where('type', 'issue')->count());
        $this->assertLotsMatchBalances($item);
        $this->assertLotsMatchEntries($item);
    }
}
