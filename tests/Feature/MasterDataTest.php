<?php

namespace Tests\Feature;

use App\Models\AssetModel;
use App\Models\Brand;
use App\Models\Category;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Vendor;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MasterDataTest extends TestCase
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

    // ── Guest / unauthenticated ──────────────────────────────

    public function test_guest_cannot_access_brands(): void
    {
        $this->getJson('/api/brands')->assertUnauthorized();
    }

    public function test_guest_cannot_access_asset_models(): void
    {
        $this->getJson('/api/asset-models')->assertUnauthorized();
    }

    public function test_guest_cannot_access_categories(): void
    {
        $this->getJson('/api/categories')->assertUnauthorized();
    }

    public function test_guest_cannot_access_vendors(): void
    {
        $this->getJson('/api/vendors')->assertUnauthorized();
    }

    public function test_guest_cannot_access_warehouses(): void
    {
        $this->getJson('/api/warehouses')->assertUnauthorized();
    }

    // ── Brands ──────────────────────────────────────────────

    public function test_super_can_create_brand(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/brands', ['name' => 'Dell', 'description' => 'PC maker'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Dell');

        $this->assertDatabaseHas('brands', ['name' => 'Dell']);
    }

    public function test_regular_user_cannot_create_brand(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/brands', ['name' => 'Dell'])
            ->assertForbidden();
    }

    public function test_can_list_brands(): void
    {
        Brand::create(['name' => 'HP']);
        Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->getJson('/api/brands')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_super_can_update_brand(): void
    {
        $brand = Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->putJson("/api/brands/{$brand->id}", ['name' => 'Dell Technologies'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Dell Technologies');

        $this->assertDatabaseHas('brands', ['id' => $brand->id, 'name' => 'Dell Technologies']);
    }

    public function test_super_can_delete_brand(): void
    {
        $brand = Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/brands/{$brand->id}")
            ->assertOk();

        $this->assertDatabaseMissing('brands', ['id' => $brand->id]);
    }

    public function test_brand_name_must_be_unique(): void
    {
        Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->postJson('/api/brands', ['name' => 'Dell'])
            ->assertUnprocessable();
    }

    // ── Asset Models ─────────────────────────────────────────

    public function test_super_can_create_asset_model_with_brand(): void
    {
        $brand = Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->postJson('/api/asset-models', ['name' => 'OptiPlex 7090', 'brand_id' => $brand->id])
            ->assertCreated()
            ->assertJsonPath('data.name', 'OptiPlex 7090')
            ->assertJsonPath('data.brand.name', 'Dell');
    }

    public function test_super_can_create_asset_model_without_brand(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/asset-models', ['name' => 'Generic Switch'])
            ->assertCreated()
            ->assertJsonPath('data.brand', null);
    }

    public function test_regular_user_cannot_create_asset_model(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/asset-models', ['name' => 'X'])
            ->assertForbidden();
    }

    public function test_super_can_update_asset_model(): void
    {
        $brand = Brand::create(['name' => 'Dell']);
        $model = AssetModel::create(['name' => 'OptiPlex', 'brand_id' => $brand->id]);

        $this->actingAs($this->superUser())
            ->putJson("/api/asset-models/{$model->id}", ['name' => 'OptiPlex 7090', 'brand_id' => $brand->id])
            ->assertOk()
            ->assertJsonPath('data.name', 'OptiPlex 7090');
    }

    public function test_super_can_delete_asset_model(): void
    {
        $model = AssetModel::create(['name' => 'OptiPlex']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/asset-models/{$model->id}")
            ->assertOk();

        $this->assertDatabaseMissing('asset_models', ['id' => $model->id]);
    }

    // ── Categories ───────────────────────────────────────────

    public function test_super_can_create_category(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/categories', ['name' => 'Laptop'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Laptop');
    }

    public function test_super_can_create_category_with_thai_name(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/categories', ['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'])
            ->assertCreated()
            ->assertJsonPath('data.name_th', 'แล็ปท็อป');

        $this->assertDatabaseHas('categories', ['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
    }

    public function test_category_name_is_required(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/categories', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_regular_user_cannot_create_category(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/categories', ['name' => 'X'])
            ->assertForbidden();
    }

    public function test_super_can_update_category(): void
    {
        $category = Category::create(['name' => 'Laptop']);

        $this->actingAs($this->superUser())
            ->putJson("/api/categories/{$category->id}", ['name' => 'Desktop'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Desktop');
    }

    public function test_super_can_delete_category(): void
    {
        $category = Category::create(['name' => 'Laptop']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/categories/{$category->id}")
            ->assertOk();

        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }

    // ── Vendors ──────────────────────────────────────────────

    public function test_super_can_create_vendor(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', [
                'name' => 'TechCorp',
                'name_th' => 'เทคคอร์ป',
                'email' => 'sales@techcorp.com',
                'phone' => '02-111-2222',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'TechCorp');
    }

    public function test_vendor_thai_name_is_required_on_create(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', ['name' => 'TechCorp'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name_th');
    }

    public function test_vendor_thai_name_is_required_on_update(): void
    {
        $vendor = Vendor::create(['name' => 'TechCorp', 'name_th' => 'เทคคอร์ป']);

        $this->actingAs($this->superUser())
            ->putJson("/api/vendors/{$vendor->id}", ['name' => 'TechCorp Ltd', 'name_th' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name_th');
    }

    public function test_super_can_create_vendor_with_thai_name(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', [
                'name' => 'TechCorp',
                'name_th' => 'เทคคอร์ป',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name_th', 'เทคคอร์ป');

        $this->assertDatabaseHas('vendors', ['name' => 'TechCorp', 'name_th' => 'เทคคอร์ป']);
    }

    public function test_vendor_email_must_be_valid(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', ['name' => 'X', 'name_th' => 'เอ็กซ์', 'email' => 'not-an-email'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_regular_user_cannot_create_vendor(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/vendors', ['name' => 'X'])
            ->assertForbidden();
    }

    public function test_super_can_update_vendor(): void
    {
        $vendor = Vendor::create(['name' => 'TechCorp', 'name_th' => 'เทคคอร์ป']);

        $this->actingAs($this->superUser())
            ->putJson("/api/vendors/{$vendor->id}", ['name' => 'TechCorp Ltd', 'name_th' => 'เทคคอร์ป จำกัด'])
            ->assertOk()
            ->assertJsonPath('data.name', 'TechCorp Ltd');
    }

    public function test_super_can_delete_vendor(): void
    {
        $vendor = Vendor::create(['name' => 'TechCorp']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/vendors/{$vendor->id}")
            ->assertOk();

        $this->assertDatabaseMissing('vendors', ['id' => $vendor->id]);
    }

    // ── Warehouses ───────────────────────────────────────────

    public function test_super_can_create_warehouse(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/warehouses', ['name' => 'Main Store'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Main Store');
    }

    public function test_warehouse_name_must_be_unique(): void
    {
        Warehouse::create(['name' => 'Main Store']);

        $this->actingAs($this->superUser())
            ->postJson('/api/warehouses', ['name' => 'Main Store'])
            ->assertUnprocessable();
    }

    public function test_regular_user_cannot_create_warehouse(): void
    {
        $this->actingAs($this->regularUser())
            ->postJson('/api/warehouses', ['name' => 'X'])
            ->assertForbidden();
    }

    public function test_non_super_user_granted_manage_warehouse_can_create(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'stock.manage_warehouse', 'allowed' => true]);

        $this->actingAs($user)
            ->postJson('/api/warehouses', ['name' => 'Keeper Store'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Keeper Store');
    }

    public function test_super_can_update_warehouse(): void
    {
        $warehouse = Warehouse::create(['name' => 'Main Store']);

        $this->actingAs($this->superUser())
            ->putJson("/api/warehouses/{$warehouse->id}", ['name' => 'Secondary Store'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Secondary Store');

        $this->assertDatabaseHas('warehouses', ['id' => $warehouse->id, 'name' => 'Secondary Store']);
    }

    public function test_super_can_delete_warehouse(): void
    {
        $warehouse = Warehouse::create(['name' => 'Main Store']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/warehouses/{$warehouse->id}")
            ->assertOk();

        $this->assertDatabaseMissing('warehouses', ['id' => $warehouse->id]);
    }
}
