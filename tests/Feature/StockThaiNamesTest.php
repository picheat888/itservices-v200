<?php

// Stock item rows and the category breakdown carry category_th next to the English category name.

namespace Tests\Feature;

use App\Models\Settings\Category;
use App\Models\Stock\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    private function itemIn(Category $category): StockItem
    {
        return StockItem::create(['sku' => 'SKU-1', 'name' => 'Toner', 'category_id' => $category->id, 'current_stock' => 3, 'min_stock' => 0, 'max_stock' => 5]);
    }

    public function test_item_list_and_summary_carry_category_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->itemIn(Category::create(['name' => 'Consumable', 'name_th' => 'วัสดุสิ้นเปลือง']));

        $this->getJson('/api/stock-items')->assertOk()->assertJsonPath('data.0.category_th', 'วัสดุสิ้นเปลือง');
        $this->getJson('/api/stock-items/summary')->assertOk()->assertJsonPath('by_category.0.category_th', 'วัสดุสิ้นเปลือง');
    }

    public function test_category_twin_is_null_without_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->itemIn(Category::create(['name' => 'Consumable']));

        $row = $this->getJson('/api/stock-items')->assertOk()->json('data.0');
        $summary = $this->getJson('/api/stock-items/summary')->assertOk()->json('by_category.0');

        $this->assertArrayHasKey('category_th', $row);
        $this->assertNull($row['category_th']);
        $this->assertArrayHasKey('category_th', $summary);
        $this->assertNull($summary['category_th']);
    }
}
