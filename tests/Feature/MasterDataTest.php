<?php

namespace Tests\Feature;

use App\Models\AssetModel;
use App\Models\Brand;
use App\Models\Category;
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
    }

    public function test_super_can_delete_brand(): void
    {
        $brand = Brand::create(['name' => 'Dell']);

        $this->actingAs($this->superUser())
            ->deleteJson("/api/brands/{$brand->id}")
            ->assertOk();

        $this->assertDatabaseMissing('brands', ['id' => $brand->id]);
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

    // ── Categories ───────────────────────────────────────────

    public function test_super_can_create_category(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/categories', ['name' => 'Laptop', 'type' => 'asset'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'asset');
    }

    public function test_category_type_must_be_valid(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/categories', ['name' => 'X', 'type' => 'invalid'])
            ->assertUnprocessable();
    }

    // ── Vendors ──────────────────────────────────────────────

    public function test_super_can_create_vendor(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', [
                'name'  => 'TechCorp',
                'email' => 'sales@techcorp.com',
                'phone' => '02-111-2222',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'TechCorp');
    }

    public function test_vendor_email_must_be_valid(): void
    {
        $this->actingAs($this->superUser())
            ->postJson('/api/vendors', ['name' => 'X', 'email' => 'not-an-email'])
            ->assertUnprocessable();
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
}
