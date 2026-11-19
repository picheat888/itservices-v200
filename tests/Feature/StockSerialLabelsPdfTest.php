<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use App\Models\Settings\Category;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerialEvent;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use Dompdf\Frame;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Tests\TestCase;

class StockSerialLabelsPdfTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Warehouse::firstOrCreate(['name' => 'Main']);
    }

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

    public function test_labels_print_the_category_name_not_the_record(): void
    {
        $item = $this->receivedItem();
        $item->update(['category_id' => Category::create(['name' => 'Toner / Cartridge'])->id]);
        $movementId = StockMovement::where('type', 'receive')->value('id');
        $seen = $this->capturePdfView('pdf.serial-labels');

        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();

        $html = view('pdf.serial-labels', $seen[0])->render();
        $this->assertStringContainsString('Toner / Cartridge', $html);
        $this->assertStringNotContainsString('&quot;id&quot;', $html);
    }

    public function test_a_serial_receive_keeps_a_reference_of_100_characters(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-2', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $reference = str_repeat('PO', 50);

        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-LONG'], 'to_label' => 'Main', 'reference' => $reference,
        ])->assertCreated();

        $this->assertSame($reference, StockItemSerialEvent::where('stock_item_id', $item->id)->value('reference'));
    }

    public function test_labels_print_the_date_in_the_date_setting(): void
    {
        $this->travelTo('2026-10-03 14:05:00');
        $this->receivedItem();
        AppSetting::put('date_format', 'd_month_y');
        $movementId = StockMovement::where('type', 'receive')->value('id');
        $seen = $this->capturePdfView('pdf.serial-labels');

        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();

        // The labels are English, so the month is too.
        $this->assertStringContainsString('03 October 2026', view('pdf.serial-labels', $seen[0])->render());
    }

    public function test_serial_label_prints_the_lot_line(): void
    {
        $this->travelTo('2026-10-21 09:00:00');
        $item = $this->receivedItem();
        $lotNo = StockLot::where('stock_item_id', $item->id)->value('lot_no');
        $movementId = StockMovement::where('type', 'receive')->value('id');
        $seen = $this->capturePdfView('pdf.serial-labels');

        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();

        $html = view('pdf.serial-labels', $seen[0])->render();
        $this->assertSame(2, substr_count($html, 'Lot:</span> '.$lotNo));
        $this->assertStringContainsString('21/10/2026', $html);
        // UAT STK-05-01: "…วันที่ของรายการ และคลัง" — the warehouse of the movement (received into Main)
        $this->assertSame(2, substr_count($html, 'Warehouse:</span> Main'));
    }

    public function test_every_line_of_a_label_prints_inside_the_sticker(): void
    {
        $this->actingAs($this->super());
        Warehouse::create(['name' => 'คลังอะไหล่อาคาร 3 ชั้น 2 ห้องเก็บของฝั่งตะวันออก']);
        $item = StockItem::create([
            'sku' => 'SSD-2TB', 'name' => 'Kingston Fury Renegade NVMe 2TB Gen4 Heatsink', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
            'category_id' => Category::create(['name' => 'Computer parts'])->id,
        ]);
        // Four serials: two rows of stickers
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-ABCDEFGHIJ-0042', 'SN-2', 'SN-3', 'SN-4'],
            'to_label' => 'คลังอะไหล่อาคาร 3 ชั้น 2 ห้องเก็บของฝั่งตะวันออก',
        ])->assertCreated();
        $movementId = StockMovement::where('type', 'receive')->value('id');
        $seen = $this->capturePdfView('pdf.serial-labels');
        $this->get("/pdf/stock-movements/{$movementId}/labels")->assertOk();

        // Laid out by dompdf itself: each label's padding box (inside its border) and the lowest text line within it
        $insideBorder = [];
        $lowestText = [];
        $dompdf = Pdf::loadView('pdf.serial-labels', $seen[0])->setPaper('a4', 'portrait')->getDomPDF();
        $dompdf->setCallbacks([['event' => 'end_frame', 'f' => function (Frame $frame) use (&$insideBorder, &$lowestText) {
            $node = $frame->get_node();
            if ($this->isLabel($frame)) {
                $box = $frame->get_padding_box();
                $insideBorder[$frame->get_id()] = $box['y'] + $box['h'];
            }
            if ($node->nodeName !== '#text' || trim($node->nodeValue) === '') {
                return;
            }
            $label = $frame->get_parent();
            while ($label !== null && ! $this->isLabel($label)) {
                $label = $label->get_parent();
            }
            if ($label !== null) {
                $box = $frame->get_border_box();
                $lowestText[$label->get_id()] = max($lowestText[$label->get_id()] ?? 0.0, $box['y'] + $box['h']);
            }
        }]]);
        $dompdf->render();

        $this->assertCount(4, $insideBorder);
        foreach ($insideBorder as $id => $bottom) {
            $this->assertArrayHasKey($id, $lowestText);
            $this->assertLessThanOrEqual($bottom, $lowestText[$id], 'a line of a label prints below the sticker border');
        }
    }

    private function isLabel(Frame $frame): bool
    {
        $node = $frame->get_node();

        return $node->nodeName === 'div' && $node->getAttribute('class') === 'label';
    }

    public function test_history_writes_month_names_in_english_like_the_rest_of_the_document(): void
    {
        $this->travelTo('2026-10-03 14:05:00');
        $item = $this->receivedItem();
        AppSetting::put('date_format', 'd_mon_y');
        $seen = $this->capturePdfView('pdf.stock-history');

        $this->get("/pdf/stock-items/{$item->id}/history")->assertOk();

        $html = view('pdf.stock-history', $seen[0])->render();
        $this->assertStringContainsString('03 Oct 2026 14:05', $html);
        $this->assertStringNotContainsString('ต.ค.', $html);
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
