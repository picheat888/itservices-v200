<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\CompanyProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryPdfTest extends TestCase
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

        $res = $this->get("/pdf/stock-items/{$item->id}/history?v=summary");
        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $res->streamedContent());
    }

    public function test_each_view_renders(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        foreach (['issue', 'receive', 'return', 'adjust', 'transfer'] as $v) {
            $res = $this->get("/pdf/stock-items/{$item->id}/history?v={$v}");
            $res->assertOk();
            $this->assertSame('application/pdf', $res->headers->get('content-type'), "view {$v}");
        }
    }

    public function test_history_reconciles_movements_with_the_on_hand_stock(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'INK-1', 'name' => 'Ink', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => false,
        ]);
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'unit_cost' => 10, 'to_label' => 'Main'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'return', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'Main'])->assertCreated();

        $data = $this->getJson("/api/stock-items/{$item->id}/history")->assertOk()->json('data');

        $lines = collect($data['reconciliation']['lines'])->keyBy('type');
        $this->assertSame(5, $lines['receive']['qty']);
        $this->assertSame(2, $lines['return']['qty']);
        $this->assertSame(1, $lines['return']['sign']);
        $this->assertSame(7, $data['reconciliation']['computed']);
        $this->assertSame(0, $data['reconciliation']['difference']);
        $this->assertSame([['warehouse' => 'Main', 'qty' => 7]], $data['balances']);

        $item->update(['current_stock' => 9]);
        $this->assertSame(2, $this->getJson("/api/stock-items/{$item->id}/history")->json('data.reconciliation.difference'));
    }

    public function test_letterhead_uses_saved_company_facts_and_no_sample_name(): void
    {
        $this->assertSame('', CompanyProfile::get()['name']);
        $this->assertSame(config('app.name'), CompanyProfile::issuer(CompanyProfile::get()));

        AppSetting::put('legal_name', 'บริษัท ทดสอบ จำกัด');
        AppSetting::put('tax_id', '0105500000001');
        $profile = CompanyProfile::get();

        $html = view('pdf.partials.letterhead', ['company' => $profile, 'title' => 'Stock summary', 'lines' => ['SKU-1'], 'lang' => 'en'])->render();
        $this->assertStringContainsString('บริษัท ทดสอบ จำกัด', $html);
        $this->assertStringContainsString('Tax ID 0105500000001', $html);
        $this->assertStringNotContainsString('ABCD Electric Company', $html);
    }

    public function test_invalid_view_defaults_to_summary(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->get("/pdf/stock-items/{$item->id}/history?v=bogus")->assertOk();
    }

    public function test_requires_stock_view_permission(): void
    {
        $item = $this->item(); // created as super inside helper
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->get("/pdf/stock-items/{$item->id}/history")->assertForbidden();
    }
}
