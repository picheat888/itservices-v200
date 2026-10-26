<?php

// Serial tracking is fixed once an item has stock, a movement or a serial on record; only a brand-new SKU may switch it.

namespace Tests\Feature;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemSerialLockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => 'super']));
    }

    private function item(int $stock = 0, bool $trackSerial = false): StockItem
    {
        $brand = Brand::create(['name' => 'Acme']);

        return StockItem::create([
            'sku' => 'SKU-0000301',
            'name' => 'SSD',
            'current_stock' => $stock,
            'min_stock' => 0,
            'max_stock' => 50,
            'track_serial' => $trackSerial,
            'category_id' => Category::create(['name' => 'Spare part'])->id,
            'brand_id' => $brand->id,
            'model_id' => AssetModel::create(['name' => 'A400', 'brand_id' => $brand->id])->id,
            'warranty_type_id' => WarrantyType::create(['name' => '1y'])->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(StockItem $item, bool $trackSerial, string $name = 'SSD'): array
    {
        return [
            'sku' => $item->sku,
            'name' => $name,
            'track_serial' => $trackSerial,
            'category_id' => $item->category_id,
            'brand_id' => $item->brand_id,
            'model_id' => $item->model_id,
            'warranty_type_id' => $item->warranty_type_id,
            'min_stock' => 0,
            'max_stock' => 50,
        ];
    }

    public function test_an_item_with_stock_keeps_its_serial_tracking(): void
    {
        $item = $this->item(stock: 10);

        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, true))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'track_serial_locked')
            ->assertJsonPath('sku', 'SKU-0000301');
        $this->assertFalse($item->fresh()->track_serial);
    }

    public function test_an_item_emptied_by_its_movements_still_keeps_it(): void
    {
        $item = $this->item(trackSerial: true);
        StockMovement::create(['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1, 'to_label' => 'Main', 'moved_at' => now()]);

        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, false))
            ->assertUnprocessable()->assertJsonPath('message', 'track_serial_locked');
        $this->assertTrue($item->fresh()->track_serial);
    }

    public function test_an_item_with_a_serial_on_record_keeps_it(): void
    {
        $item = $this->item(trackSerial: true);
        StockItemSerial::create(['stock_item_id' => $item->id, 'serial' => 'SN-1', 'status' => 'issued']);

        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, false))
            ->assertUnprocessable()->assertJsonPath('message', 'track_serial_locked');
    }

    public function test_other_fields_of_a_locked_item_still_save(): void
    {
        $item = $this->item(stock: 10);

        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, false, 'SSD 480GB'))->assertOk();
        $this->assertSame('SSD 480GB', $item->fresh()->name);
    }

    public function test_a_brand_new_item_may_switch_either_way(): void
    {
        $item = $this->item();

        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, true))->assertOk();
        $this->assertTrue($item->fresh()->track_serial);
        $this->putJson("/api/stock-items/{$item->id}", $this->payload($item, false))->assertOk();
        $this->assertFalse($item->fresh()->track_serial);
    }

    public function test_the_list_and_detail_say_whether_the_switch_is_locked(): void
    {
        $locked = $this->item(stock: 3);
        $fresh = StockItem::create(['sku' => 'SKU-0000302', 'name' => 'New', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 5]);

        $rows = collect($this->getJson('/api/stock-items')->assertOk()->json('data'))->keyBy('sku');
        $this->assertTrue($rows['SKU-0000301']['serial_locked']);
        $this->assertFalse($rows['SKU-0000302']['serial_locked']);
        $this->getJson("/api/stock-items/{$locked->id}")->assertOk()->assertJsonPath('data.serial_locked', true);
        $this->getJson("/api/stock-items/{$fresh->id}")->assertOk()->assertJsonPath('data.serial_locked', false);
    }
}
