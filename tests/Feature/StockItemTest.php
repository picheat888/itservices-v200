<?php

namespace Tests\Feature;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemTest extends TestCase
{
    use RefreshDatabase;

    private function superUser(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function regularUser(): User
    {
        return User::factory()->create(['role' => 'user']);
    }

    private function makeItem(array $overrides = []): StockItem
    {
        return StockItem::create(array_merge([
            'sku' => 'SK-TEST-'.fake()->unique()->numerify('###'),
            'name' => 'Test item',
            'unit' => 'unit',
            'cost' => 100,
            'current_stock' => 5,
            'min_stock' => 2,
            'max_stock' => 10,
            'category' => 'Cable',
            'last_move_at' => now(),
        ], $overrides));
    }

    public function test_guest_cannot_list_stock_items(): void
    {
        $this->getJson('/api/stock-items')->assertUnauthorized();
    }

    public function test_super_can_list_stock_items(): void
    {
        $this->makeItem();

        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_status_is_derived_from_current_vs_min_max(): void
    {
        $this->assertSame('out', $this->makeItem(['current_stock' => 0])->status());
        $this->assertSame('low', $this->makeItem(['current_stock' => 1, 'min_stock' => 3])->status());
        $this->assertSame('over', $this->makeItem(['current_stock' => 20, 'max_stock' => 10])->status());
        $this->assertSame('ok', $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()])->status());
        $this->assertSame('dead', $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()->subDays(120)])->status());
    }

    public function test_status_filter_matches_derived_status(): void
    {
        // One item per status, mirroring the branch order of StockItem::status().
        $out = $this->makeItem(['current_stock' => 0, 'min_stock' => 3]);
        $low = $this->makeItem(['current_stock' => 1, 'min_stock' => 5]);
        $over = $this->makeItem(['current_stock' => 30, 'max_stock' => 10]);
        $dead = $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()->subDays(200)]);
        $ok = $this->makeItem(['current_stock' => 5, 'min_stock' => 2, 'max_stock' => 10, 'last_move_at' => now()]);

        // Sanity: the PHP-derived status of each fixture is what we expect.
        $this->assertSame('out', $out->status());
        $this->assertSame('low', $low->status());
        $this->assertSame('over', $over->status());
        $this->assertSame('dead', $dead->status());
        $this->assertSame('ok', $ok->status());

        $user = $this->superUser();

        // Each concrete status: the SQL filter returns exactly the matching item.
        foreach (['out' => $out, 'low' => $low, 'over' => $over, 'dead' => $dead, 'ok' => $ok] as $status => $item) {
            $this->actingAs($user)
                ->getJson("/api/stock-items?status={$status}")
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonPath('data.0.id', $item->id)
                ->assertJsonPath('data.0.status', $status);
        }

        // 'alerts' = everything that is not 'ok'.
        $this->actingAs($user)
            ->getJson('/api/stock-items?status=alerts')
            ->assertOk()
            ->assertJsonPath('meta.total', 4);
    }

    public function test_index_is_server_paginated_and_sortable(): void
    {
        for ($n = 1; $n <= 25; $n++) {
            $this->makeItem(['name' => sprintf('Item %02d', $n)]);
        }

        $user = $this->superUser();

        // Page 1 returns per_page rows with full pagination meta.
        $this->actingAs($user)
            ->getJson('/api/stock-items?per_page=10&page=1&sort=name_asc')
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 3)
            ->assertJsonPath('data.0.name', 'Item 01');

        // Descending sort flips the first row.
        $this->actingAs($user)
            ->getJson('/api/stock-items?per_page=10&sort=name_desc')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Item 25');

        // all=1 bypasses pagination for pickers/drawers.
        $this->actingAs($user)
            ->getJson('/api/stock-items?all=1')
            ->assertOk()
            ->assertJsonCount(25, 'data');
    }

    public function test_summary_reports_alert_buckets(): void
    {
        $this->makeItem(['current_stock' => 0, 'min_stock' => 3]);            // out
        $this->makeItem(['current_stock' => 1, 'min_stock' => 5]);            // low
        $this->makeItem(['current_stock' => 30, 'max_stock' => 10]);          // over
        $this->makeItem(['current_stock' => 5, 'last_move_at' => now()->subDays(200)]); // dead

        // out and low are reported as separate buckets; the UI sums them for its
        // "needs reorder" KPI (out_count + low_count).
        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items/summary')
            ->assertOk()
            ->assertJsonPath('skus', 4)
            ->assertJsonPath('out_count', 1)
            ->assertJsonPath('low_count', 1)
            ->assertJsonPath('over_count', 1)
            ->assertJsonPath('dead_count', 1);
    }

    public function test_super_can_create_stock_item(): void
    {
        // The SKU is now generated server-side (SKU-#######); any sku sent by the
        // client is ignored. A new SKU starts empty — stock and cost are no longer
        // set here, they arrive via Receive (per-lot). So it's created "out".
        $unit = Unit::create(['name' => 'drive']);
        $warranty = WarrantyType::create(['name' => '1y']);
        $brand = Brand::create(['name' => 'Acme']);
        $model = AssetModel::create(['name' => 'M1', 'brand_id' => $brand->id]);
        $category = Category::create(['name' => 'Cable']);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', [
                'name' => 'New SSD',
                'unit_id' => $unit->id,
                'category_id' => $category->id,
                'brand_id' => $brand->id,
                'model_id' => $model->id,
                'warranty_type_id' => $warranty->id,
                'min_stock' => 2,
                'max_stock' => 12,
            ])
            ->assertCreated()
            ->assertJsonPath('data.sku', 'SKU-0000001')
            ->assertJsonPath('data.current_stock', 0)
            ->assertJsonPath('data.status', 'out')
            ->assertJsonPath('data.unit', 'drive')
            ->assertJsonPath('data.unit_id', $unit->id)
            ->assertJsonPath('data.category', 'Cable')
            ->assertJsonPath('data.category_id', $category->id)
            ->assertJsonPath('data.brand', 'Acme')
            ->assertJsonPath('data.brand_id', $brand->id)
            ->assertJsonPath('data.model', 'M1')
            ->assertJsonPath('data.model_id', $model->id)
            ->assertJsonPath('data.warranty', '1y')
            ->assertJsonPath('data.warranty_type_id', $warranty->id);

        $this->assertDatabaseHas('stock_items', ['sku' => 'SKU-0000001', 'current_stock' => 0]);
    }

    public function test_new_sku_is_auto_generated_and_sequential(): void
    {
        $super = $this->superUser();
        $warranty = WarrantyType::create(['name' => '1y']);
        $brand = Brand::create(['name' => 'Acme']);
        $model = AssetModel::create(['name' => 'M1', 'brand_id' => $brand->id]);
        $category = Category::create(['name' => 'Cable']);

        $first = $this->actingAs($super)
            ->postJson('/api/stock-items', ['name' => 'Item A', 'category_id' => $category->id, 'brand_id' => $brand->id, 'model_id' => $model->id, 'warranty_type_id' => $warranty->id, 'min_stock' => 0, 'max_stock' => 5])
            ->assertCreated()->json('data.sku');
        $second = $this->actingAs($super)
            ->postJson('/api/stock-items', ['name' => 'Item B', 'category_id' => $category->id, 'brand_id' => $brand->id, 'model_id' => $model->id, 'warranty_type_id' => $warranty->id, 'min_stock' => 0, 'max_stock' => 5])
            ->assertCreated()->json('data.sku');

        $this->assertSame('SKU-0000001', $first);
        $this->assertSame('SKU-0000002', $second);
    }

    public function test_auto_sku_ignores_manually_entered_codes(): void
    {
        // A legacy/manual SKU that doesn't match the SKU-####### pattern must not
        // feed the running sequence, so the first auto SKU is still SKU-0000001.
        $this->makeItem(['sku' => 'SK-NB-099']);
        $warranty = WarrantyType::create(['name' => '1y']);
        $brand = Brand::create(['name' => 'Acme']);
        $model = AssetModel::create(['name' => 'M1', 'brand_id' => $brand->id]);
        $category = Category::create(['name' => 'Cable']);

        $sku = $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', ['name' => 'Item', 'category_id' => $category->id, 'brand_id' => $brand->id, 'model_id' => $model->id, 'warranty_type_id' => $warranty->id, 'min_stock' => 0, 'max_stock' => 5])
            ->assertCreated()->json('data.sku');

        $this->assertSame('SKU-0000001', $sku);
    }

    public function test_index_reports_reserved_from_approved_requests_only(): void
    {
        $item = $this->makeItem(['current_stock' => 10]);
        // Approved counts toward reserved; pending does not (it isn't committed yet).
        StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'A', 'qty' => 3, 'reason' => 'x', 'status' => 'approved']);
        StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'B', 'qty' => 5, 'reason' => 'y', 'status' => 'pending']);

        $this->actingAs($this->superUser())
            ->getJson('/api/stock-items')
            ->assertOk()
            ->assertJsonPath('data.0.reserved', 3);
    }

    public function test_create_requires_category_brand_model_warranty(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', ['name' => 'X', 'min_stock' => 0, 'max_stock' => 5])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['category_id', 'brand_id', 'model_id', 'warranty_type_id']);
    }

    public function test_create_rejects_negative_min_max(): void
    {
        $warranty = WarrantyType::create(['name' => '1y']);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', [
                'name' => 'X', 'category' => 'Cable', 'brand' => 'Acme', 'model' => 'M1', 'warranty_type_id' => $warranty->id,
                'min_stock' => -1, 'max_stock' => -2,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['min_stock', 'max_stock']);
    }

    public function test_create_rejects_max_less_than_min(): void
    {
        $warranty = WarrantyType::create(['name' => '1y']);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-items', [
                'name' => 'X', 'category' => 'Cable', 'brand' => 'Acme', 'model' => 'M1', 'warranty_type_id' => $warranty->id,
                'min_stock' => 10, 'max_stock' => 5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['max_stock']);
    }

    public function test_user_without_manage_items_cannot_create(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/stock-items', ['sku' => 'SK-X', 'name' => 'X', 'unit' => 'unit', 'cost' => 1, 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 1])
            ->assertForbidden();
    }

    public function test_super_can_delete_empty_zero_value_item(): void
    {
        $item = $this->makeItem(['current_stock' => 0]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertOk();

        $this->assertDatabaseMissing('stock_items', ['id' => $item->id]);
    }

    public function test_cannot_delete_item_that_still_has_stock(): void
    {
        $item = $this->makeItem(['current_stock' => 5]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('stock_items', ['id' => $item->id]);
    }

    public function test_cannot_delete_item_that_still_has_value(): void
    {
        // Zero on-hand but an open FIFO lot still carries value → not deletable.
        $item = $this->makeItem(['current_stock' => 0]);
        StockLot::create([
            'stock_item_id' => $item->id,
            'unit_cost' => 100,
            'qty_received' => 2,
            'qty_remaining' => 2,
            'received_at' => now(),
        ]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('stock_items', ['id' => $item->id]);
    }

    /**
     * The ledger is the audit trail, and it used to cascade away with the SKU: an item
     * received and then issued out lands back on zero stock and zero value, which passed
     * both checks above. The refusal — and the restrictOnDelete FK behind it — is what
     * stops a delete from taking the movement history with it and reporting success.
     */
    public function test_cannot_delete_item_that_has_ever_moved(): void
    {
        $item = $this->makeItem(['current_stock' => 0]);
        $movement = StockMovement::create([
            'doc_no' => 'RC-0001',
            'type' => 'receive',
            'stock_item_id' => $item->id,
            'qty' => 2,
            'unit_cost' => 50,
            'moved_at' => now(),
        ]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'has_history')
            ->assertJsonPath('movements_count', 1);

        $this->assertDatabaseHas('stock_items', ['id' => $item->id]);
        $this->assertDatabaseHas('stock_movements', ['id' => $movement->id]);
    }

    public function test_user_without_delete_permission_cannot_delete(): void
    {
        $item = $this->makeItem(['current_stock' => 0]);

        $this->actingAs($this->regularUser())
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertForbidden();
    }

    public function test_renaming_a_unit_propagates_to_stock_items(): void
    {
        $unit = Unit::create(['name' => 'box']);
        $item = $this->makeItem(['unit_id' => $unit->id]);

        $unit->update(['name' => 'carton']);

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.unit', 'carton');
    }

    public function test_renaming_a_warranty_type_propagates_to_stock_items(): void
    {
        $warranty = WarrantyType::create(['name' => '1 Year']);
        $item = $this->makeItem(['warranty_type_id' => $warranty->id]);

        $warranty->update(['name' => '2 Years']);

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.warranty', '2 Years');
    }

    public function test_unit_in_use_cannot_be_deleted(): void
    {
        $unit = Unit::create(['name' => 'In Use Unit']);
        $this->makeItem(['unit_id' => $unit->id]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/units/{$unit->id}")
            ->assertStatus(409);
        $this->assertDatabaseHas('units', ['id' => $unit->id]);
    }

    public function test_warranty_type_in_use_cannot_be_deleted(): void
    {
        $warranty = WarrantyType::create(['name' => 'In Use Warranty']);
        $this->makeItem(['warranty_type_id' => $warranty->id]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/warranty-types/{$warranty->id}")
            ->assertStatus(409);
        $this->assertDatabaseHas('warranty_types', ['id' => $warranty->id]);
    }

    public function test_renaming_a_brand_propagates_to_stock_items(): void
    {
        $brand = Brand::create(['name' => 'Acmee']);
        $item = $this->makeItem(['brand_id' => $brand->id]);

        $brand->update(['name' => 'Acme']);

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.brand', 'Acme');
    }

    public function test_renaming_a_model_propagates_to_stock_items(): void
    {
        $model = AssetModel::create(['name' => 'Old Part']);
        $item = $this->makeItem(['model_id' => $model->id]);

        $model->update(['name' => 'New Part']);

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.model', 'New Part');
    }

    public function test_brand_in_use_by_a_stock_item_cannot_be_deleted(): void
    {
        $brand = Brand::create(['name' => 'In Use Brand']);
        $this->makeItem(['brand_id' => $brand->id]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/brands/{$brand->id}")
            ->assertStatus(409);
        $this->assertDatabaseHas('brands', ['id' => $brand->id]);
    }

    public function test_asset_model_in_use_by_a_stock_item_cannot_be_deleted(): void
    {
        $model = AssetModel::create(['name' => 'In Use Part']);
        $this->makeItem(['model_id' => $model->id]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/asset-models/{$model->id}")
            ->assertStatus(409);
        $this->assertDatabaseHas('asset_models', ['id' => $model->id]);
    }

    public function test_renaming_a_category_propagates_to_stock_items(): void
    {
        $category = Category::create(['name' => 'Old Cat']);
        $item = $this->makeItem(['category_id' => $category->id]);

        $category->update(['name' => 'New Cat']);

        $this->actingAs($this->superUser())
            ->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.category', 'New Cat');
    }

    public function test_category_in_use_by_a_stock_item_cannot_be_deleted(): void
    {
        $category = Category::create(['name' => 'In Use Cat']);
        $this->makeItem(['category_id' => $category->id]);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/categories/{$category->id}")
            ->assertStatus(409);
        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }
}
