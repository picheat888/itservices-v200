<?php

// Lot stickers (QR) and the issue sheet (ISS) PDF of a fulfilled request.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\LotQr;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Tests\TestCase;

class StockLotPdfTest extends TestCase
{
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Warehouse::create(['name' => 'คลังกลาง IT']);
        $this->super = User::factory()->create(['role' => 'super', 'name' => 'Picheat S']);
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

    private function item(string $sku, bool $serial = false): StockItem
    {
        return StockItem::create(['sku' => $sku, 'name' => 'หมึก HP 107A', 'cost' => 100, 'track_serial' => $serial]);
    }

    /** @param  array<string, mixed>  $extra */
    private function receive(StockItem $item, string $movedAt, array $extra = []): StockLot
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'to_label' => 'คลังกลาง IT', 'moved_at' => $movedAt, ...$extra,
        ])->assertCreated();

        return StockLot::where('stock_item_id', $item->id)->latest('id')->firstOrFail();
    }

    private function request(StockItem $item, int $qty, string $status = 'approved'): StockRequest
    {
        return StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Somchai K',
            'qty' => $qty, 'reason' => 'เปลี่ยนหมึกเครื่องพิมพ์ชั้น 3', 'status' => $status,
            'approver_name' => 'Anan P', 'approved_at' => '2026-10-28 09:00:00',
        ]);
    }

    /** A request for 10 that draws 6 from LOT-20260812-0003 (emptied) and 4 from LOT-20260930-0001. */
    private function fulfilledAcrossTwoLots(): StockRequest
    {
        $other = $this->item('SKU-0000001');
        $this->receive($other, '2026-08-12 08:00:00', ['qty' => 1]);
        $this->receive($other, '2026-08-12 08:30:00', ['qty' => 1]);
        $ink = $this->item('SKU-0000231');
        $this->receive($ink, '2026-08-12 09:00:00', ['qty' => 6, 'unit_cost' => 900]);
        $this->receive($ink, '2026-09-30 09:10:00', ['qty' => 20, 'unit_cost' => 920]);
        $request = $this->request($ink, 10);
        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['from_warehouse' => 'คลังกลาง IT'])->assertOk();

        return $request->fresh();
    }

    /** The data each render of a PDF view received, so the test can render it to HTML. */
    private function capturePdfView(string $view): \ArrayObject
    {
        $seen = new \ArrayObject;
        View::composer($view, function ($v) use ($seen) {
            $seen->append(array_diff_key($v->getData(), ['__env' => 1, 'app' => 1, 'errors' => 1]));
        });

        return $seen;
    }

    public function test_lot_labels_pdf_streams_n_copies(): void
    {
        $lot = $this->receive($this->item('SKU-0000231'), '2026-10-28 09:30:00', ['qty' => 10]);
        $seen = $this->capturePdfView('pdf.lot-labels');

        $response = $this->get("/pdf/stock-lots/{$lot->lot_no}/labels?copies=3")->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $response->streamedContent());
        $this->assertStringContainsString('LotLabels_'.$lot->lot_no, (string) $response->headers->get('content-disposition'));
        $html = view('pdf.lot-labels', $seen[0])->render();
        $this->assertSame(3, substr_count($html, 'class="label"'));
        $this->assertStringContainsString($lot->lot_no, $html);
        $this->assertStringContainsString('SKU-0000231', $html);
        $this->assertStringContainsString('Qty 10', $html);
        $this->assertStringContainsString('Received 28/10/2026', $html);
        $this->assertStringContainsString('src="data:image/svg+xml;base64,', $html);
    }

    public function test_lot_labels_default_to_one_copy_and_cap_at_99(): void
    {
        $lot = $this->receive($this->item('SKU-0000231'), '2026-10-28 09:30:00', ['qty' => 10]);
        $seen = $this->capturePdfView('pdf.lot-labels');

        $this->get("/pdf/stock-lots/{$lot->lot_no}/labels")->assertOk();
        $this->get("/pdf/stock-lots/{$lot->lot_no}/labels?copies=500")->assertOk();
        $this->get("/pdf/stock-lots/{$lot->lot_no}/labels?copies=0")->assertOk();

        $this->assertSame([1, 99, 1], array_map(fn (array $data): int => $data['copies'], $seen->getArrayCopy()));
    }

    public function test_lot_labels_need_stock_view_and_a_known_lot(): void
    {
        $lot = $this->receive($this->item('SKU-0000231'), '2026-10-28 09:30:00', ['qty' => 10]);

        $this->get('/pdf/stock-lots/LOT-20990101-0001/labels')->assertNotFound();
        $this->actingAs($this->userWith([]))->get("/pdf/stock-lots/{$lot->lot_no}/labels")->assertForbidden();
        $this->actingAs($this->userWith(['stock.view']))->get("/pdf/stock-lots/{$lot->lot_no}/labels")->assertOk();
    }

    public function test_qr_payload_uses_the_configured_app_url(): void
    {
        config(['app.url' => 'https://desk.example.test/']);

        $this->assertSame('https://desk.example.test/stock/lots/LOT-20261028-0002', LotQr::payload('LOT-20261028-0002'));
    }

    public function test_issue_pdf_needs_a_fulfilled_request(): void
    {
        $item = $this->item('SKU-0000231');
        $this->receive($item, '2026-10-01 09:00:00', ['qty' => 5]);
        $request = $this->request($item, 2);

        $this->getJson("/pdf/stock-requests/{$request->id}/issue")
            ->assertStatus(422)
            ->assertJsonPath('message', 'request_not_issued');
    }

    public function test_issue_pdf_lists_the_lots_drawn(): void
    {
        $this->travelTo('2026-10-28 10:45:00');
        $request = $this->fulfilledAcrossTwoLots();
        $issueNo = StockMovement::where('stock_request_id', $request->id)->where('type', 'issue')->value('doc_no');
        $seen = $this->capturePdfView('pdf.stock-issue');

        $response = $this->get("/pdf/stock-requests/{$request->id}/issue")->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $response->streamedContent());
        $this->assertStringContainsString("StockIssue_{$issueNo}", (string) $response->headers->get('content-disposition'));
        $html = view('pdf.stock-issue', $seen[0])->render();
        $this->assertStringContainsString('ใบจ่ายของ', $html);
        $this->assertStringContainsString($issueNo, $html);
        $this->assertStringContainsString('อ้างอิงคำขอเบิก '.$request->reference, $html);
        $this->assertStringContainsString('จ่ายจาก Lot', $html);
        $this->assertStringContainsString('LOT-20260812-0003', $html);
        $this->assertStringContainsString('LOT-20260930-0001', $html);
        $this->assertSame(1, substr_count($html, 'หยิบหมด Lot'));
        $this->assertSame(2, substr_count($html, 'class="box"'));
        $this->assertStringContainsString('ผู้รับของ (Somchai K)', $html);
        $this->assertStringContainsString('ผู้จ่ายของ (Picheat S)', $html);
        $this->assertStringContainsString('ผู้อนุมัติ (Anan P)', $html);
        $this->assertStringContainsString('เปลี่ยนหมึกเครื่องพิมพ์ชั้น 3', $html);
    }

    public function test_issue_pdf_follows_the_request_gate_and_visibility(): void
    {
        $request = $this->fulfilledAcrossTwoLots();

        $this->actingAs($this->userWith([]))->get("/pdf/stock-requests/{$request->id}/issue")->assertForbidden();
        $this->actingAs($this->userWith(['stock.view_request']))->get("/pdf/stock-requests/{$request->id}/issue")->assertNotFound();
        $this->actingAs($this->userWith(['stock.view_request', 'stock.fulfill']))->get("/pdf/stock-requests/{$request->id}/issue")->assertOk();
    }
}
