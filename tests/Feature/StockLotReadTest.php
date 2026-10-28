<?php

// Lot read endpoints: the lot page, the scan lookup, the QR image, the lots of a movement,
// a request's trail and the requests a return can name; plus lot fields on the item and its history.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockLotReadTest extends TestCase
{
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Warehouse::create(['name' => 'A']);
        Warehouse::create(['name' => 'B']);
        $this->super = User::factory()->create(['role' => 'super', 'name' => 'Keeper']);
        $this->actingAs($this->super);
    }

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'gate_'.uniqid(), 'name' => 'Gate Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function item(bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-LOT-'.fake()->unique()->numerify('###'),
            'name' => 'Ink 107A',
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

    /** @param  array<string, mixed>  $payload */
    private function fulfilled(StockItem $item, int $qty, array $payload, ?User $requester = null, string $name = 'Somchai K'): StockRequest
    {
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => ($requester ?? $this->super)->id, 'requester_name' => $name,
            'qty' => $qty, 'reason' => 'Use', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$request->id}/fulfill", $payload)->assertOk();

        return $request->fresh();
    }

    /** @param  list<array{lot_id: int, qty: int}>  $lots */
    private function returnLots(StockItem $item, StockRequest $request, array $lots): void
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $request->id, 'lots' => $lots,
        ])->assertCreated();
    }

    /** 24 received into A, 7 issued to a request, 3 of them returned. */
    private function inkLot(): array
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 24, 'unit_cost' => 920, 'reference' => 'PO-2026-131']);
        $request = $this->fulfilled($item, 7, ['from_warehouse' => 'A']);
        $this->returnLots($item, $request, [['lot_id' => $lot->id, 'qty' => 3]]);

        return [$item, $lot->fresh(), $request];
    }

    public function test_lot_page_reconciles(): void
    {
        [$item, $lot, $request] = $this->inkLot();

        $response = $this->getJson("/api/stock-lots/{$lot->lot_no}")->assertOk();

        $response->assertJsonPath('data.lot_no', $lot->lot_no)
            ->assertJsonPath('data.item.sku', $item->sku)
            ->assertJsonPath('data.warehouse', 'A')
            ->assertJsonPath('data.unit_cost', 920)
            ->assertJsonPath('data.received_doc_no', $lot->movement->doc_no)
            ->assertJsonPath('data.tiles', ['received' => 24, 'issued' => 7, 'returned' => 3, 'adjusted' => 0, 'remaining' => 20])
            ->assertJsonPath('data.check', ['balanced' => true, 'diff' => 0]);

        $entries = $response->json('data.entries');
        $this->assertSame(['receive', 'issue', 'return'], array_column($entries, 'type'));
        $this->assertSame([24, -7, 3], array_column($entries, 'qty'));
        $this->assertSame([24, 17, 20], array_column($entries, 'balance_after'));
        $this->assertSame([null, $request->reference, $request->reference], array_column($entries, 'request_reference'));
        $this->assertSame(['Keeper', 'Somchai K', 'Somchai K'], array_column($entries, 'person'));
        $this->assertSame(['A', 'A', 'A'], array_column($entries, 'warehouse'));
        $this->assertSame(['PO-2026-131', $request->reference, $request->reference], array_column($entries, 'reference'));
        $this->assertSame($lot->entries()->orderBy('id')->pluck('id')->all(), array_column($entries, 'id'));
    }

    public function test_lot_page_shows_a_transfer_as_zero_and_the_warehouse_change(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 5]);
        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'A', 'to_label' => 'B', 'lot_ids' => [$lot->id],
        ])->assertCreated();

        $entries = $this->getJson("/api/stock-lots/{$lot->lot_no}")->assertOk()
            ->assertJsonPath('data.warehouse', 'B')
            ->json('data.entries');

        $this->assertSame('transfer', $entries[1]['type']);
        $this->assertSame(0, $entries[1]['qty']);
        $this->assertSame(5, $entries[1]['balance_after']);
        $this->assertSame('A', $entries[1]['from_warehouse']);
        $this->assertSame('B', $entries[1]['warehouse']);
    }

    public function test_lot_page_shows_count_rows_with_their_reason(): void
    {
        $item = $this->item(serial: true);
        $lot = $this->receive($item, 'A', '2026-08-01 10:00:00', ['serials' => ['S-1', 'S-2', 'S-3']]);
        $serialId = fn (string $serial): int => (int) $item->serials()->where('serial', $serial)->value('id');
        $warehouseId = (int) Warehouse::where('name', 'A')->value('id');

        $count = $this->postJson('/api/stock-counts', ['warehouse_id' => $warehouseId, 'stock_item_ids' => [$item->id]])->assertCreated()->json('data');
        $this->putJson("/api/stock-counts/{$count['id']}", ['lines' => [$count['lines'][0]['id'] => ['missing_serial_ids' => [$serialId('S-1')], 'reason' => 'lost']]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        // A recount whose loss and find cancel out books entries without a movement
        $recount = $this->postJson("/api/stock-counts/{$count['id']}/recount")->assertCreated()->json('data');
        $this->putJson("/api/stock-counts/{$recount['id']}", ['lines' => [$recount['lines'][0]['id'] => ['missing_serial_ids' => [$serialId('S-2')], 'found_serial_ids' => [$serialId('S-1')]]]])->assertOk();
        $this->postJson("/api/stock-counts/{$recount['id']}/commit", [])->assertOk();

        $response = $this->getJson("/api/stock-lots/{$lot->lot_no}")->assertOk()
            ->assertJsonPath('data.tiles', ['received' => 3, 'issued' => 0, 'returned' => 0, 'adjusted' => -1, 'remaining' => 2])
            ->assertJsonPath('data.check', ['balanced' => true, 'diff' => 0]);

        $entries = $response->json('data.entries');
        $this->assertSame(['receive', 'adjust_down', 'adjust_down', 'adjust_up'], array_column($entries, 'type'));
        $this->assertSame('lost', $entries[1]['reason']);
        $this->assertSame(StockMovement::where('reference', $count['reference'])->value('doc_no'), $entries[1]['doc_no']);
        $this->assertSame([$recount['reference'], $recount['reference']], [$entries[2]['doc_no'], $entries[3]['doc_no']]);
        $this->assertSame([null, null], [$entries[2]['reason'], $entries[3]['reason']]);
        $this->assertSame(['Keeper', 'Keeper'], [$entries[2]['recorded_by'], $entries[3]['recorded_by']]);
        $this->assertSame([3, 2, 1, 2], array_column($entries, 'balance_after'));
    }

    public function test_unknown_lot_page_is_404(): void
    {
        $this->getJson('/api/stock-lots/LOT-20990101-0001')->assertNotFound();
    }

    public function test_lot_page_needs_stock_view(): void
    {
        [, $lot] = $this->inkLot();

        $this->actingAs($this->userWith(['stock.module', 'stock.view_request']))
            ->getJson("/api/stock-lots/{$lot->lot_no}")
            ->assertForbidden();
    }

    public function test_lookup_accepts_a_full_qr_link_and_lowercase(): void
    {
        $this->travelTo('2026-10-28 12:00:00');
        $item = $this->item();
        $this->receive($item, 'A', '2026-10-28 08:00:00', ['qty' => 2]);
        $this->receive($item, 'B', '2026-10-28 09:00:00', ['qty' => 10, 'unit_cost' => 935]);

        $this->getJson('/api/stock-lots/lookup?code='.urlencode('https://x/stock/lots/lot-20261028-0002?utm=1'))
            ->assertOk()
            ->assertJsonPath('data.lot_no', 'LOT-20261028-0002')
            ->assertJsonPath('data.item.sku', $item->sku)
            ->assertJsonPath('data.warehouse', 'B')
            ->assertJsonPath('data.remaining', 10)
            ->assertJsonPath('data.unit_cost', 935)
            ->assertJsonPath('data.state', 'in_stock')
            ->assertJsonMissingPath('data.serial');
    }

    public function test_lookup_of_an_emptied_lot_says_empty(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 2]);
        $this->fulfilled($item, 2, ['from_warehouse' => 'A']);

        $this->getJson('/api/stock-lots/lookup?code='.$lot->lot_no)
            ->assertOk()
            ->assertJsonPath('data.remaining', 0)
            ->assertJsonPath('data.state', 'empty');
    }

    public function test_lookup_of_a_serial_returns_its_lot(): void
    {
        $item = $this->item(serial: true);
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['serials' => ['SN-ABC-1', 'SN-ABC-2']]);

        $this->getJson('/api/stock-lots/lookup?code=sn-abc-2')
            ->assertOk()
            ->assertJsonPath('data.lot_no', $lot->lot_no)
            ->assertJsonPath('data.remaining', 2)
            ->assertJsonPath('data.serial', 'SN-ABC-2');
    }

    public function test_lookup_of_junk_is_lot_not_a_code(): void
    {
        $this->getJson('/api/stock-lots/lookup?code=8851234567890')
            ->assertStatus(422)
            ->assertJsonPath('message', 'lot_not_a_code')
            ->assertJsonPath('errors.code.0', 'lot_not_a_code');

        // Seven date digits is not a lot number either
        $this->getJson('/api/stock-lots/lookup?code=LOT-2026102-0001')
            ->assertStatus(422)
            ->assertJsonPath('message', 'lot_not_a_code');
    }

    public function test_lookup_of_unknown_number_is_lot_not_found(): void
    {
        $this->getJson('/api/stock-lots/lookup?code=lot-20990101-0001')
            ->assertStatus(422)
            ->assertJsonPath('message', 'lot_not_found')
            ->assertJsonPath('lot_no', 'LOT-20990101-0001')
            ->assertJsonPath('errors.code.0', 'lot_not_found');
    }

    public function test_qr_is_svg(): void
    {
        [, $lot] = $this->inkLot();

        $response = $this->get("/api/stock-lots/{$lot->lot_no}/qr")->assertOk();

        $this->assertStringStartsWith('image/svg+xml', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('<svg', $response->getContent());
        $this->assertStringNotContainsString('data:image', $response->getContent());
    }

    public function test_qr_of_unknown_lot_is_404(): void
    {
        $this->get('/api/stock-lots/LOT-20990101-0001/qr')->assertNotFound();
    }

    public function test_movement_lots_of_an_issue_show_returns_and_what_is_left(): void
    {
        $item = $this->item();
        $l1 = $this->receive($item, 'A', '2026-08-12 09:00:00', ['qty' => 6, 'unit_cost' => 890]);
        $l2 = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 24, 'unit_cost' => 920]);
        $request = $this->fulfilled($item, 10, ['from_warehouse' => 'A']);
        $this->returnLots($item, $request, [['lot_id' => $l2->id, 'qty' => 3]]);
        $issue = StockMovement::where('type', 'issue')->sole();
        $ret = StockMovement::where('type', 'return')->sole();

        $response = $this->getJson("/api/stock-movements/{$issue->id}/lots")->assertOk();

        $response->assertJsonPath('data.returns', [['doc_no' => $ret->doc_no, 'qty' => 3]])
            ->assertJsonPath('data.returnable', 7);
        $lots = $response->json('data.lots');
        $this->assertSame([$l1->lot_no, $l2->lot_no], array_column($lots, 'lot_no'));
        $this->assertSame([6, 4], array_column($lots, 'qty'));
        $this->assertSame([0, 3], array_column($lots, 'returned'));
        $this->assertSame([0, 23], array_column($lots, 'remaining'));
        $this->assertSame(['empty', 'in_stock'], array_column($lots, 'state'));
        $this->assertEquals([890, 920], array_column($lots, 'unit_cost'));
    }

    public function test_movement_lots_of_a_receive_name_the_opened_lot(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 24]);
        $this->fulfilled($item, 4, ['from_warehouse' => 'A']);

        $this->getJson("/api/stock-movements/{$lot->stock_movement_id}/lots")
            ->assertOk()
            ->assertJsonPath('data.lots.0.lot_no', $lot->lot_no)
            ->assertJsonPath('data.lots.0.warehouse', 'A')
            ->assertJsonPath('data.lots.0.qty', 24)
            ->assertJsonPath('data.lots.0.remaining', 20)
            ->assertJsonPath('data.returns', [])
            ->assertJsonPath('data.returnable', 0);
    }

    public function test_movement_lots_need_view_events(): void
    {
        [, $lot] = $this->inkLot();

        $this->actingAs($this->userWith(['stock.module', 'stock.view']))
            ->getJson("/api/stock-movements/{$lot->stock_movement_id}/lots")
            ->assertForbidden();
    }

    public function test_request_trail_lists_the_issue_and_its_returns(): void
    {
        [, $lot, $request] = $this->inkLot();
        $issue = StockMovement::where('type', 'issue')->sole();
        $ret = StockMovement::where('type', 'return')->sole();

        $this->getJson("/api/stock-requests/{$request->id}/trail")
            ->assertOk()
            ->assertJsonPath('data.issue.doc_no', $issue->doc_no)
            ->assertJsonPath('data.issue.recorded_by', 'Keeper')
            ->assertJsonPath('data.issue.lines.0.lot_no', $lot->lot_no)
            ->assertJsonPath('data.issue.lines.0.warehouse', 'A')
            ->assertJsonPath('data.issue.lines.0.qty', 7)
            ->assertJsonPath('data.issue.lines.0.returned', 3)
            ->assertJsonPath('data.returns.0.doc_no', $ret->doc_no)
            ->assertJsonPath('data.returns.0.lines', [['warehouse' => 'A', 'lot_no' => $lot->lot_no, 'qty' => 3]])
            ->assertJsonPath('data.returnable', 4);
    }

    public function test_request_trail_of_an_unfulfilled_request_has_no_issue(): void
    {
        $item = $this->item();
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => 1, 'reason' => 'Use', 'status' => 'pending',
        ]);

        $this->getJson("/api/stock-requests/{$request->id}/trail")
            ->assertOk()
            ->assertJsonPath('data', ['issue' => null, 'returns' => [], 'returnable' => 0]);
    }

    public function test_requester_sees_only_their_own_trail(): void
    {
        $item = $this->item();
        $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 10]);
        $requester = $this->userWith(['stock.module', 'stock.view_request', 'stock.request']);
        $own = $this->fulfilled($item, 2, ['from_warehouse' => 'A'], $requester, 'Own');
        $other = $this->fulfilled($item, 2, ['from_warehouse' => 'A']);

        $this->actingAs($requester);
        $this->getJson("/api/stock-requests/{$own->id}/trail")->assertOk()->assertJsonPath('data.returnable', 2);
        $this->getJson("/api/stock-requests/{$other->id}/trail")->assertNotFound();

        $this->actingAs($this->userWith(['stock.module', 'stock.view']))
            ->getJson("/api/stock-requests/{$own->id}/trail")
            ->assertForbidden();
    }

    public function test_returnable_hides_fully_returned_requests(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 20]);
        $done = $this->fulfilled($item, 3, ['from_warehouse' => 'A'], name: 'Anan P');
        $this->returnLots($item, $done, [['lot_id' => $lot->id, 'qty' => 3]]);
        $open = $this->fulfilled($item, 5, ['from_warehouse' => 'A'], name: 'Wanida S');
        $this->returnLots($item, $open, [['lot_id' => $lot->id, 'qty' => 2]]);
        $other = $this->item();
        $this->receive($other, 'A', '2026-09-30 09:10:00', ['qty' => 5]);
        $this->fulfilled($other, 1, ['from_warehouse' => 'A']);

        $rows = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}")->assertOk()->json('data');

        $this->assertSame([$open->id], array_column($rows, 'id'));
        $this->assertSame($open->reference, $rows[0]['reference']);
        $this->assertSame('Wanida S', $rows[0]['requester_name']);
        $this->assertSame(3, $rows[0]['left']);
        $this->assertSame([['lot_id' => $lot->id, 'lot_no' => $lot->lot_no, 'warehouse' => 'A', 'issued' => 5, 'returned' => 2, 'left' => 3]], $rows[0]['lots']);
        $this->assertSame([], $rows[0]['serials']);
    }

    public function test_returnable_searches_reference_and_requester(): void
    {
        $item = $this->item();
        $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 20]);
        $anan = $this->fulfilled($item, 1, ['from_warehouse' => 'A'], name: 'Anan P');
        $wanida = $this->fulfilled($item, 1, ['from_warehouse' => 'A'], name: 'Wanida S');

        $byName = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}&search=wanida")->assertOk()->json('data');
        $this->assertSame([$wanida->id], array_column($byName, 'id'));

        $byReference = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}&search=".$anan->reference)->assertOk()->json('data');
        $this->assertSame([$anan->id], array_column($byReference, 'id'));

        // Newest fulfilled first
        $all = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}")->assertOk()->json('data');
        $this->assertSame([$wanida->id, $anan->id], array_column($all, 'id'));
    }

    public function test_returnable_filters_by_request_id(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 20]);
        $anan = $this->fulfilled($item, 1, ['from_warehouse' => 'A'], name: 'Anan P');
        $this->fulfilled($item, 1, ['from_warehouse' => 'A'], name: 'Wanida S');
        $done = $this->fulfilled($item, 2, ['from_warehouse' => 'A'], name: 'Done D');
        $this->returnLots($item, $done, [['lot_id' => $lot->id, 'qty' => 2]]);

        $rows = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}&stock_request_id={$anan->id}")->assertOk()->json('data');
        $this->assertSame([$anan->id], array_column($rows, 'id'));

        // A request with nothing left to return is not listed
        $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}&stock_request_id={$done->id}")
            ->assertOk()
            ->assertJsonPath('data', []);
    }

    public function test_returnable_lists_the_serials_still_out(): void
    {
        $item = $this->item(serial: true);
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['serials' => ['SN-1', 'SN-2', 'SN-3']]);
        $serials = $item->serials()->orderBy('serial')->get();
        $request = $this->fulfilled($item, 2, ['serial_ids' => [$serials[0]->id, $serials[1]->id]]);
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $request->id, 'serial_ids' => [$serials[0]->id],
        ])->assertCreated();

        $rows = $this->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}")->assertOk()->json('data');

        $this->assertSame(1, $rows[0]['left']);
        $this->assertSame([['id' => $serials[1]->id, 'serial' => 'SN-2', 'lot_no' => $lot->lot_no]], $rows[0]['serials']);
    }

    public function test_returnable_needs_stock_return(): void
    {
        $item = $this->item();

        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_request']))
            ->getJson("/api/stock-requests/returnable?stock_item_id={$item->id}")
            ->assertForbidden();
    }

    public function test_item_show_lots_carry_ledger_figures(): void
    {
        [$item, $lot] = $this->inkLot();

        $this->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.lots.0.lot_no', $lot->lot_no)
            ->assertJsonPath('data.lots.0.warehouse', 'A')
            ->assertJsonPath('data.lots.0.received_doc_no', $lot->movement->doc_no)
            ->assertJsonPath('data.lots.0.qty_issued', 7)
            ->assertJsonPath('data.lots.0.qty_returned', 3)
            ->assertJsonPath('data.lots.0.qty_remaining', 20);
    }

    public function test_history_rows_name_their_lots(): void
    {
        [$item, $lot, $request] = $this->inkLot();
        $this->receive($item, 'B', '2026-10-01 09:00:00', ['qty' => 4]);

        $data = $this->getJson("/api/stock-items/{$item->id}/history")->assertOk()->json('data');

        $issue = collect($data['movements'])->firstWhere('type', 'issue');
        $this->assertSame([['lot_no' => $lot->lot_no, 'qty' => 7]], $issue['lots']);
        $this->assertSame($request->reference, $issue['request_reference']);
        $this->assertSame('Somchai K', $issue['requester']);

        $receive = collect($data['movements'])->firstWhere('doc_no', $lot->movement->doc_no);
        $this->assertSame([['lot_no' => $lot->lot_no, 'qty' => 24]], $receive['lots']);
        $this->assertNull($receive['request_reference']);

        $lotRow = collect($data['lots'])->firstWhere('lot_no', $lot->lot_no);
        $this->assertSame('A', $lotRow['warehouse']);

        $this->assertSame(['A' => 1, 'B' => 1], collect($data['balances'])->pluck('lot_count', 'warehouse')->all());
    }

    public function test_history_transfer_row_names_what_each_lot_carried(): void
    {
        $item = $this->item();
        $lot = $this->receive($item, 'A', '2026-09-30 09:10:00', ['qty' => 6]);
        $this->fulfilled($item, 2, ['from_warehouse' => 'A']);
        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'A', 'to_label' => 'B', 'lot_ids' => [$lot->id],
        ])->assertCreated();

        $data = $this->getJson("/api/stock-items/{$item->id}/history")->assertOk()->json('data');

        $transfer = collect($data['movements'])->firstWhere('type', 'transfer');
        $this->assertSame([['lot_no' => $lot->lot_no, 'qty' => 4]], $transfer['lots']);
    }
}
