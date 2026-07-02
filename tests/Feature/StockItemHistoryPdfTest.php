<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryPdfTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(): StockItem
    {
        // Set up the receive as a super (full perms) regardless of who the test
        // later acts as — keeps fixture creation independent of caller auth.
        $this->actingAs($this->super());

        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // One receive so there is something to render.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        return $item;
    }

    public function test_summary_pdf_streams_a_pdf(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $res = $this->get("/api/stock-items/{$item->id}/history/pdf?v=summary");
        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $res->streamedContent());
    }

    public function test_each_view_renders(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        foreach (['issue', 'receive', 'adjust', 'transfer'] as $v) {
            $res = $this->get("/api/stock-items/{$item->id}/history/pdf?v={$v}");
            $res->assertOk();
            $this->assertSame('application/pdf', $res->headers->get('content-type'), "view {$v}");
        }
    }

    public function test_invalid_view_defaults_to_summary(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->get("/api/stock-items/{$item->id}/history/pdf?v=bogus")->assertOk();
    }

    public function test_requires_stock_view_permission(): void
    {
        $item = $this->item(); // created as super inside helper
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->get("/api/stock-items/{$item->id}/history/pdf")->assertForbidden();
    }
}
