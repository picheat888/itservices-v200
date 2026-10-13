<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
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

    /** The data each render of a PDF view received, so the test can render it to HTML. */
    private function capturePdfView(string $view): \ArrayObject
    {
        $seen = new \ArrayObject;
        View::composer($view, function ($v) use ($seen) {
            $seen->append(array_diff_key($v->getData(), ['__env' => 1, 'app' => 1, 'errors' => 1]));
        });

        return $seen;
    }

    public function test_labels_print_the_date_in_the_date_setting(): void
    {
        $this->travelTo('2026-10-03 14:05:00');
        $this->receivedItem();
        AppSetting::put('date_format', 'd_month_y');
        $movementId = StockMovement::where('type', 'receive')->value('id');
        $seen = $this->capturePdfView('pdf.serial-labels');

        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();

        $this->assertStringContainsString('03 ตุลาคม 2026', view('pdf.serial-labels', $seen[0])->render());
    }

    public function test_history_prints_movement_times_in_the_date_setting_at_their_wall_time(): void
    {
        $this->travelTo('2026-10-03 14:05:00');
        $item = $this->receivedItem();
        $seen = $this->capturePdfView('pdf.stock-history');

        $this->get("/pdf/stock-items/{$item->id}/history")->assertOk();

        $html = view('pdf.stock-history', $seen[0])->render();
        $this->assertStringContainsString('03/10/2026 14:05', $html);
        $this->assertStringNotContainsString('2026-10-03', $html);
    }
}
