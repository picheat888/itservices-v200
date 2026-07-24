<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockSerialLabelsPdfTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function receivedItem(): StockItem
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        return $item;
    }

    public function test_labels_pdf_streams_a_pdf(): void
    {
        $this->actingAs($this->super());
        $this->receivedItem();
        $movementId = StockMovement::where('type', 'receive')->value('id');

        $res = $this->get("/pdf/stock-movements/{$movementId}/labels");
        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $res->streamedContent());
    }

    public function test_labels_pdf_renders_even_with_no_serials(): void
    {
        // A quantity-only movement has no serials — the sheet should still render.
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'CBL-1', 'name' => 'Cable', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => false,
        ]);
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'Main'])
            ->assertCreated();
        $movementId = StockMovement::where('stock_item_id', $item->id)->value('id');

        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();
    }

    public function test_requires_stock_view_permission(): void
    {
        $this->receivedItem(); // created as super inside helper
        $movementId = StockMovement::where('type', 'receive')->value('id');

        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->get("/pdf/stock-movements/{$movementId}/labels")->assertForbidden();
    }
}
