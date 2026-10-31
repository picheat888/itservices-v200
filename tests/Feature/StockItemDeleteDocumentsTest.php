<?php

// A stock item a requisition or a stock count names cannot be deleted: the delete would cascade those documents away.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemDeleteDocumentsTest extends TestCase
{
    use RefreshDatabase;

    private function emptyItem(): StockItem
    {
        return StockItem::create(['sku' => 'SKU-DOC-1', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 5]);
    }

    public function test_an_item_on_a_requisition_or_a_count_is_refused_and_both_stay(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $item = $this->emptyItem();
        $request = StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'Asker', 'qty' => 1, 'reason' => 'Use', 'status' => 'pending']);
        $count = StockCount::create(['status' => 'draft']);
        $line = StockCountLine::create(['stock_count_id' => $count->id, 'stock_item_id' => $item->id, 'system_qty' => 0]);

        $this->deleteJson("/api/stock-items/{$item->id}")
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'has_documents', 'documents_count' => 2]);

        $this->assertModelExists($item);
        $this->assertModelExists($request);
        $this->assertModelExists($line);
        $this->assertSame(0, AuditLog::where('action', 'Deleted stock item')->count());
    }

    public function test_a_closed_requisition_still_holds_the_item(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $item = $this->emptyItem();
        StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'Asker', 'qty' => 1, 'reason' => 'Use', 'status' => 'rejected']);

        $this->deleteJson("/api/stock-items/{$item->id}")->assertUnprocessable()->assertJsonPath('message', 'has_documents');
    }

    public function test_an_item_nothing_names_is_still_deleted(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $item = $this->emptyItem();

        $this->deleteJson("/api/stock-items/{$item->id}")->assertOk()->assertExactJson(['message' => 'success']);
        $this->assertModelMissing($item);
    }
}
