<?php

// The Stock Requests and Movements lists search on the server: number, item, person (EN/TH), any word order.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockListSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $withThai;

    private User $withoutThai;

    private StockItem $toner;

    private StockItem $cable;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $thai = Employee::create(['code' => 'E-TH1', 'first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        $plain = Employee::create(['code' => 'E-EN2', 'first_name' => 'Peter', 'last_name' => 'Brown']);
        $this->withThai = User::factory()->create(['role' => 'user', 'employee_id' => $thai->id]);
        $this->withoutThai = User::factory()->create(['role' => 'user', 'employee_id' => $plain->id]);

        $this->toner = StockItem::create(['sku' => 'TNR-100', 'name' => 'Laser Toner', 'current_stock' => 5, 'min_stock' => 0, 'max_stock' => 9]);
        $this->cable = StockItem::create(['sku' => 'CBL-200', 'name' => 'Patch Cable', 'current_stock' => 5, 'min_stock' => 0, 'max_stock' => 9]);
    }

    private function request(string $reference, StockItem $item, User $user, string $name): StockRequest
    {
        return StockRequest::create(['reference' => $reference, 'stock_item_id' => $item->id, 'user_id' => $user->id, 'requester_name' => $name, 'qty' => 1, 'reason' => 'Need', 'status' => 'pending']);
    }

    private function movement(string $docNo, StockItem $item, User $user, ?string $reference = null): StockMovement
    {
        return StockMovement::create([
            'doc_no' => $docNo, 'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1,
            'reference' => $reference, 'recorded_by' => 'Recorder', 'user_id' => $user->id, 'moved_at' => now(),
        ]);
    }

    /** @return list<string> */
    private function found(string $url, string $search, string $key): array
    {
        return collect($this->getJson($url.'?search='.urlencode($search))->assertOk()->json('data'))->pluck($key)->all();
    }

    public function test_requests_are_found_by_number_item_and_requester(): void
    {
        $this->request('REQ-2026-0001', $this->toner, $this->withThai, 'Somchai Jaidee');
        $this->request('REQ-2026-0002', $this->cable, $this->withoutThai, 'Peter Brown');

        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', '0001', 'reference'));
        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', 'TNR-100', 'reference'));
        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', 'laser', 'reference'));
        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', 'ใจดี', 'reference'));
        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', 'สมชายใจดี', 'reference'));
        $this->assertSame(['REQ-2026-0001'], $this->found('/api/stock-requests', 'toner สมชาย', 'reference'));
        $this->assertSame([], $this->found('/api/stock-requests', 'nothing-matches', 'reference'));
    }

    public function test_requests_requester_without_thai_name_is_found_by_english_name_and_code(): void
    {
        $this->request('REQ-2026-0001', $this->toner, $this->withThai, 'Somchai Jaidee');
        $this->request('REQ-2026-0002', $this->cable, $this->withoutThai, 'Peter Brown');

        $this->assertSame(['REQ-2026-0002'], $this->found('/api/stock-requests', 'brown peter', 'reference'));
        $this->assertSame(['REQ-2026-0002'], $this->found('/api/stock-requests', 'E-EN2', 'reference'));
    }

    public function test_requests_search_keeps_the_status_filter(): void
    {
        $this->request('REQ-2026-0001', $this->toner, $this->withThai, 'Somchai Jaidee')->update(['status' => 'rejected']);
        $this->request('REQ-2026-0002', $this->toner, $this->withThai, 'Somchai Jaidee');

        $rows = $this->getJson('/api/stock-requests?status=pending&search=toner')->assertOk()->json('data.*.reference');

        $this->assertSame(['REQ-2026-0002'], $rows);
    }

    public function test_movements_are_found_by_doc_no_item_reference_and_recorder(): void
    {
        $this->movement('MV-0001', $this->toner, $this->withThai, 'PO-7788');
        $this->movement('MV-0002', $this->cable, $this->withoutThai, 'PO-9900');

        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'MV-0001', 'doc_no'));
        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'TNR-100', 'doc_no'));
        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'laser', 'doc_no'));
        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'PO-7788', 'doc_no'));
        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'ใจดี', 'doc_no'));
        $this->assertSame(['MV-0001'], $this->found('/api/stock-movements', 'po-7788 toner', 'doc_no'));
        $this->assertSame([], $this->found('/api/stock-movements', 'nothing-matches', 'doc_no'));
    }

    public function test_movements_recorder_without_thai_name_is_found_by_english_name_and_code(): void
    {
        $this->movement('MV-0001', $this->toner, $this->withThai);
        $this->movement('MV-0002', $this->cable, $this->withoutThai);

        $this->assertSame(['MV-0002'], $this->found('/api/stock-movements', 'brown peter', 'doc_no'));
        $this->assertSame(['MV-0002'], $this->found('/api/stock-movements', 'E-EN2', 'doc_no'));
    }
}
