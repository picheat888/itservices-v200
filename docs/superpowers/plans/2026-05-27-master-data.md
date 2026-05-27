# Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Master Data section to Settings with six sub-tabs (Brands, Models, Categories, Supplier/Vendor, Warehouse, Locations) used across Assets, Contract, and Stock modules.

**Architecture:** Five new DB tables with Eloquent models → five API controllers → five apiResource route groups, all following the existing LocationController pattern. The frontend adds a `MasterDataTab` component with a flat sub-tab bar inside `settings/index.tsx`, reusing the existing inline-edit row pattern from `LocationsTab`. The existing Locations nav item is removed and Locations becomes one of the six sub-tabs.

**Tech Stack:** Laravel 12 (PHP 8.2), React 19, TypeScript, TanStack Query, Tailwind CSS v4, Lucide icons.

---

## File Map

| Action | Path |
|--------|------|
| Create | `database/migrations/2026_05_27_000001_create_brands_table.php` |
| Create | `database/migrations/2026_05_27_000002_create_asset_models_table.php` |
| Create | `database/migrations/2026_05_27_000003_create_categories_table.php` |
| Create | `database/migrations/2026_05_27_000004_create_vendors_table.php` |
| Create | `database/migrations/2026_05_27_000005_create_warehouses_table.php` |
| Create | `app/Models/Brand.php` |
| Create | `app/Models/AssetModel.php` |
| Create | `app/Models/Category.php` |
| Create | `app/Models/Vendor.php` |
| Create | `app/Models/Warehouse.php` |
| Create | `app/Http/Controllers/Api/BrandController.php` |
| Create | `app/Http/Controllers/Api/AssetModelController.php` |
| Create | `app/Http/Controllers/Api/CategoryController.php` |
| Create | `app/Http/Controllers/Api/VendorController.php` |
| Create | `app/Http/Controllers/Api/WarehouseController.php` |
| Modify | `routes/api.php` |
| Modify | `resources/js/types/index.ts` |
| Create | `resources/js/services/masterDataApi.ts` |
| Create | `resources/js/hooks/use-master-data.ts` |
| Modify | `resources/js/lib/i18n.ts` |
| Modify | `resources/js/pages/settings/index.tsx` |
| Create | `tests/Feature/MasterDataTest.php` |

---

## Task 1: Migrations

**Files:**
- Create: `database/migrations/2026_05_27_000001_create_brands_table.php`
- Create: `database/migrations/2026_05_27_000002_create_asset_models_table.php`
- Create: `database/migrations/2026_05_27_000003_create_categories_table.php`
- Create: `database/migrations/2026_05_27_000004_create_vendors_table.php`
- Create: `database/migrations/2026_05_27_000005_create_warehouses_table.php`

- [ ] **Step 1: Create brands migration**

```bash
php artisan make:migration create_brands_table --no-interaction
```

Edit the generated file to:

```php
public function up(): void
{
    Schema::create('brands', function (Blueprint $table) {
        $table->id();
        $table->string('name', 120)->unique();
        $table->string('description', 255)->nullable();
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('brands');
}
```

- [ ] **Step 2: Create asset_models migration**

```bash
php artisan make:migration create_asset_models_table --no-interaction
```

Edit:

```php
public function up(): void
{
    Schema::create('asset_models', function (Blueprint $table) {
        $table->id();
        $table->string('name', 120);
        $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
        $table->string('description', 255)->nullable();
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('asset_models');
}
```

- [ ] **Step 3: Create categories migration**

```bash
php artisan make:migration create_categories_table --no-interaction
```

Edit:

```php
public function up(): void
{
    Schema::create('categories', function (Blueprint $table) {
        $table->id();
        $table->string('name', 120);
        $table->enum('type', ['asset', 'contract', 'stock']);
        $table->string('description', 255)->nullable();
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('categories');
}
```

- [ ] **Step 4: Create vendors migration**

```bash
php artisan make:migration create_vendors_table --no-interaction
```

Edit:

```php
public function up(): void
{
    Schema::create('vendors', function (Blueprint $table) {
        $table->id();
        $table->string('name', 120);
        $table->string('contact', 120)->nullable();
        $table->string('phone', 50)->nullable();
        $table->string('email', 120)->nullable();
        $table->string('address', 255)->nullable();
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('vendors');
}
```

- [ ] **Step 5: Create warehouses migration**

```bash
php artisan make:migration create_warehouses_table --no-interaction
```

Edit:

```php
public function up(): void
{
    Schema::create('warehouses', function (Blueprint $table) {
        $table->id();
        $table->string('name', 120)->unique();
        $table->string('description', 255)->nullable();
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('warehouses');
}
```

- [ ] **Step 6: Run migrations**

```bash
php artisan migrate --no-interaction
```

Expected: 5 new tables created, no errors.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/
git commit -m "feat: add master data migrations (brands, asset_models, categories, vendors, warehouses)"
```

---

## Task 2: Eloquent Models

**Files:**
- Create: `app/Models/Brand.php`
- Create: `app/Models/AssetModel.php`
- Create: `app/Models/Category.php`
- Create: `app/Models/Vendor.php`
- Create: `app/Models/Warehouse.php`

- [ ] **Step 1: Create Brand model**

```bash
php artisan make:model Brand --no-interaction
```

Replace content:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Brand extends Model
{
    protected $fillable = ['name', 'description'];

    /** Asset models that belong to this brand. */
    public function assetModels(): HasMany
    {
        return $this->hasMany(AssetModel::class);
    }
}
```

- [ ] **Step 2: Create AssetModel model**

```bash
php artisan make:model AssetModel --no-interaction
```

Replace content:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssetModel extends Model
{
    protected $fillable = ['name', 'brand_id', 'description'];

    /** The brand this model belongs to. */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
```

- [ ] **Step 3: Create Category model**

```bash
php artisan make:model Category --no-interaction
```

Replace content:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    protected $fillable = ['name', 'type', 'description'];
}
```

- [ ] **Step 4: Create Vendor model**

```bash
php artisan make:model Vendor --no-interaction
```

Replace content:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    protected $fillable = ['name', 'contact', 'phone', 'email', 'address'];
}
```

- [ ] **Step 5: Create Warehouse model**

```bash
php artisan make:model Warehouse --no-interaction
```

Replace content:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    protected $fillable = ['name', 'description'];
}
```

- [ ] **Step 6: Commit**

```bash
git add app/Models/Brand.php app/Models/AssetModel.php app/Models/Category.php app/Models/Vendor.php app/Models/Warehouse.php
git commit -m "feat: add master data Eloquent models"
```

---

## Task 3: API Controllers

**Files:**
- Create: `app/Http/Controllers/Api/BrandController.php`
- Create: `app/Http/Controllers/Api/AssetModelController.php`
- Create: `app/Http/Controllers/Api/CategoryController.php`
- Create: `app/Http/Controllers/Api/VendorController.php`
- Create: `app/Http/Controllers/Api/WarehouseController.php`

- [ ] **Step 1: Create BrandController**

```bash
php artisan make:controller Api/BrandController --api --no-interaction
```

Replace content with:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BrandController extends Controller
{
    /** List all brands ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Brand::orderBy('name')->get()]);
    }

    /** Create a new brand. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120', 'unique:brands,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $brand = Brand::create($data);
        AuditLog::record('Created brand', $brand->name);

        return response()->json(['data' => $brand, 'message' => 'success'], 201);
    }

    /** Update an existing brand. */
    public function update(Request $request, Brand $brand): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120', 'unique:brands,name,' . $brand->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $brand->update($data);
        AuditLog::record('Updated brand', $brand->name);

        return response()->json(['data' => $brand, 'message' => 'success']);
    }

    /** Delete a brand. */
    public function destroy(Request $request, Brand $brand): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted brand', $brand->name);
        $brand->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 2: Create AssetModelController**

```bash
php artisan make:controller Api/AssetModelController --api --no-interaction
```

Replace content with:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\AssetModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetModelController extends Controller
{
    /** List all asset models with their brand, ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => AssetModel::with('brand')->orderBy('name')->get()]);
    }

    /** Create a new asset model. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'brand_id'    => ['nullable', 'integer', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $model = AssetModel::create($data);
        $model->load('brand');
        AuditLog::record('Created asset model', $model->name);

        return response()->json(['data' => $model, 'message' => 'success'], 201);
    }

    /** Update an existing asset model. */
    public function update(Request $request, AssetModel $assetModel): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'brand_id'    => ['nullable', 'integer', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $assetModel->update($data);
        $assetModel->load('brand');
        AuditLog::record('Updated asset model', $assetModel->name);

        return response()->json(['data' => $assetModel, 'message' => 'success']);
    }

    /** Delete an asset model. */
    public function destroy(Request $request, AssetModel $assetModel): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted asset model', $assetModel->name);
        $assetModel->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 3: Create CategoryController**

```bash
php artisan make:controller Api/CategoryController --api --no-interaction
```

Replace content with:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    /** List all categories ordered by type then name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Category::orderBy('type')->orderBy('name')->get()]);
    }

    /** Create a new category. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'type'        => ['required', 'in:asset,contract,stock'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $category = Category::create($data);
        AuditLog::record('Created category', "{$category->name} ({$category->type})");

        return response()->json(['data' => $category, 'message' => 'success'], 201);
    }

    /** Update an existing category. */
    public function update(Request $request, Category $category): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'type'        => ['required', 'in:asset,contract,stock'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $category->update($data);
        AuditLog::record('Updated category', "{$category->name} ({$category->type})");

        return response()->json(['data' => $category, 'message' => 'success']);
    }

    /** Delete a category. */
    public function destroy(Request $request, Category $category): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted category', $category->name);
        $category->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 4: Create VendorController**

```bash
php artisan make:controller Api/VendorController --api --no-interaction
```

Replace content with:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VendorController extends Controller
{
    /** List all vendors ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Vendor::orderBy('name')->get()]);
    }

    /** Create a new vendor. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'    => ['required', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:120'],
            'phone'   => ['nullable', 'string', 'max:50'],
            'email'   => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
        $vendor = Vendor::create($data);
        AuditLog::record('Created vendor', $vendor->name);

        return response()->json(['data' => $vendor, 'message' => 'success'], 201);
    }

    /** Update an existing vendor. */
    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'    => ['required', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:120'],
            'phone'   => ['nullable', 'string', 'max:50'],
            'email'   => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
        $vendor->update($data);
        AuditLog::record('Updated vendor', $vendor->name);

        return response()->json(['data' => $vendor, 'message' => 'success']);
    }

    /** Delete a vendor. */
    public function destroy(Request $request, Vendor $vendor): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted vendor', $vendor->name);
        $vendor->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 5: Create WarehouseController**

```bash
php artisan make:controller Api/WarehouseController --api --no-interaction
```

Replace content with:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarehouseController extends Controller
{
    /** List all warehouses ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Warehouse::orderBy('name')->get()]);
    }

    /** Create a new warehouse. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120', 'unique:warehouses,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $warehouse = Warehouse::create($data);
        AuditLog::record('Created warehouse', $warehouse->name);

        return response()->json(['data' => $warehouse, 'message' => 'success'], 201);
    }

    /** Update an existing warehouse. */
    public function update(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120', 'unique:warehouses,name,' . $warehouse->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $warehouse->update($data);
        AuditLog::record('Updated warehouse', $warehouse->name);

        return response()->json(['data' => $warehouse, 'message' => 'success']);
    }

    /** Delete a warehouse. */
    public function destroy(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted warehouse', $warehouse->name);
        $warehouse->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 6: Run Pint formatter**

```bash
vendor/bin/pint app/Http/Controllers/Api/BrandController.php app/Http/Controllers/Api/AssetModelController.php app/Http/Controllers/Api/CategoryController.php app/Http/Controllers/Api/VendorController.php app/Http/Controllers/Api/WarehouseController.php app/Models/Brand.php app/Models/AssetModel.php app/Models/Category.php app/Models/Vendor.php app/Models/Warehouse.php --format agent
```

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Api/BrandController.php app/Http/Controllers/Api/AssetModelController.php app/Http/Controllers/Api/CategoryController.php app/Http/Controllers/Api/VendorController.php app/Http/Controllers/Api/WarehouseController.php app/Models/
git commit -m "feat: add master data controllers and models"
```

---

## Task 4: API Routes

**Files:**
- Modify: `routes/api.php`

- [ ] **Step 1: Add imports and routes**

In `routes/api.php`, add the five new use-imports after the existing ones (around line 14):

```php
use App\Http\Controllers\Api\AssetModelController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\VendorController;
use App\Http\Controllers\Api\WarehouseController;
```

Then, inside the `auth:sanctum` middleware group, after the existing `Route::apiResource('locations', ...)` line, add:

```php
    // Master Data module
    Route::apiResource('brands', BrandController::class)->except(['show']);
    Route::apiResource('asset-models', AssetModelController::class)->except(['show']);
    Route::apiResource('categories', CategoryController::class)->except(['show']);
    Route::apiResource('vendors', VendorController::class)->except(['show']);
    Route::apiResource('warehouses', WarehouseController::class)->except(['show']);
```

- [ ] **Step 2: Verify routes are registered**

```bash
php artisan route:list --path=brands --no-interaction
```

Expected output includes: `GET /api/brands`, `POST /api/brands`, `PUT /api/brands/{brand}`, `DELETE /api/brands/{brand}`.

- [ ] **Step 3: Run Pint**

```bash
vendor/bin/pint routes/api.php --format agent
```

- [ ] **Step 4: Commit**

```bash
git add routes/api.php
git commit -m "feat: register master data API routes"
```

---

## Task 5: Feature Tests

**Files:**
- Create: `tests/Feature/MasterDataTest.php`

- [ ] **Step 1: Create test file**

```bash
php artisan make:test MasterDataTest --no-interaction
```

- [ ] **Step 2: Write tests**

Replace the content of `tests/Feature/MasterDataTest.php`:

```php
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
```

- [ ] **Step 3: Run tests**

```bash
php artisan test --compact tests/Feature/MasterDataTest.php
```

Expected: all tests pass (green).

- [ ] **Step 4: Commit**

```bash
git add tests/Feature/MasterDataTest.php
git commit -m "test: add MasterDataTest feature tests"
```

---

## Task 6: Frontend Types

**Files:**
- Modify: `resources/js/types/index.ts`

- [ ] **Step 1: Add master data interfaces**

At the end of `resources/js/types/index.ts`, append:

```ts
// Master Data types
export interface Brand {
    id: number;
    name: string;
    description?: string | null;
}

export interface AssetModel {
    id: number;
    name: string;
    brand_id?: number | null;
    brand?: Brand | null;
    description?: string | null;
}

export type CategoryType = 'asset' | 'contract' | 'stock';

export interface Category {
    id: number;
    name: string;
    type: CategoryType;
    description?: string | null;
}

export interface Vendor {
    id: number;
    name: string;
    contact?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
}

export interface Warehouse {
    id: number;
    name: string;
    description?: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/types/index.ts
git commit -m "feat: add master data TypeScript types"
```

---

## Task 7: API Service

**Files:**
- Create: `resources/js/services/masterDataApi.ts`

- [ ] **Step 1: Create service file**

Create `resources/js/services/masterDataApi.ts`:

```ts
import type { ApiEnvelope, AssetModel, Brand, Category, Vendor, Warehouse } from '@/types';
import { ensureCsrf, http } from './http';

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const brandApi = {
    list: () => http.get<ApiEnvelope<Brand[]>>('/brands').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Brand>('post', '/brands', payload),
    update: (id: number, payload: { name: string; description?: string }) => mutate<Brand>('put', `/brands/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/brands/${id}`),
};

export const assetModelApi = {
    list: () => http.get<ApiEnvelope<AssetModel[]>>('/asset-models').then((r) => r.data.data),
    create: (payload: { name: string; brand_id?: number | null; description?: string }) =>
        mutate<AssetModel>('post', '/asset-models', payload),
    update: (id: number, payload: { name: string; brand_id?: number | null; description?: string }) =>
        mutate<AssetModel>('put', `/asset-models/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/asset-models/${id}`),
};

export const categoryApi = {
    list: () => http.get<ApiEnvelope<Category[]>>('/categories').then((r) => r.data.data),
    create: (payload: { name: string; type: string; description?: string }) =>
        mutate<Category>('post', '/categories', payload),
    update: (id: number, payload: { name: string; type: string; description?: string }) =>
        mutate<Category>('put', `/categories/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/categories/${id}`),
};

export const vendorApi = {
    list: () => http.get<ApiEnvelope<Vendor[]>>('/vendors').then((r) => r.data.data),
    create: (payload: { name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
        mutate<Vendor>('post', '/vendors', payload),
    update: (
        id: number,
        payload: { name: string; contact?: string; phone?: string; email?: string; address?: string },
    ) => mutate<Vendor>('put', `/vendors/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/vendors/${id}`),
};

export const warehouseApi = {
    list: () => http.get<ApiEnvelope<Warehouse[]>>('/warehouses').then((r) => r.data.data),
    create: (payload: { name: string; description?: string }) => mutate<Warehouse>('post', '/warehouses', payload),
    update: (id: number, payload: { name: string; description?: string }) =>
        mutate<Warehouse>('put', `/warehouses/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/warehouses/${id}`),
};
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/services/masterDataApi.ts
git commit -m "feat: add master data API service"
```

---

## Task 8: React Query Hooks

**Files:**
- Create: `resources/js/hooks/use-master-data.ts`

- [ ] **Step 1: Create hook file**

Create `resources/js/hooks/use-master-data.ts`:

```ts
import { assetModelApi, brandApi, categoryApi, vendorApi, warehouseApi } from '@/services/masterDataApi';
import type { AssetModel, Brand, Category, Vendor, Warehouse } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BRANDS = ['brands'] as const;
const MODELS = ['asset-models'] as const;
const CATS = ['categories'] as const;
const VENDORS = ['vendors'] as const;
const WAREHOUSES = ['warehouses'] as const;

export const useBrands = () => useQuery({ queryKey: BRANDS, queryFn: brandApi.list });
export const useAssetModels = () => useQuery({ queryKey: MODELS, queryFn: assetModelApi.list });
export const useCategories = () => useQuery({ queryKey: CATS, queryFn: categoryApi.list });
export const useVendors = () => useQuery({ queryKey: VENDORS, queryFn: vendorApi.list });
export const useWarehouses = () => useQuery({ queryKey: WAREHOUSES, queryFn: warehouseApi.list });

export function useBrandMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: BRANDS });
    return {
        create: useMutation({ mutationFn: (p: { name: string; description?: string }) => brandApi.create(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) => brandApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => brandApi.remove(id), onSuccess: inv }),
    };
}

export function useAssetModelMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: MODELS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; brand_id?: number | null; description?: string }) => assetModelApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; brand_id?: number | null; description?: string }) =>
                assetModelApi.update(v.id, { name: v.name, brand_id: v.brand_id, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => assetModelApi.remove(id), onSuccess: inv }),
    };
}

export function useCategoryMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: CATS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; type: string; description?: string }) => categoryApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; type: string; description?: string }) =>
                categoryApi.update(v.id, { name: v.name, type: v.type, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => categoryApi.remove(id), onSuccess: inv }),
    };
}

export function useVendorMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: VENDORS });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; contact?: string; phone?: string; email?: string; address?: string }) =>
                vendorApi.update(v.id, { name: v.name, contact: v.contact, phone: v.phone, email: v.email, address: v.address }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => vendorApi.remove(id), onSuccess: inv }),
    };
}

export function useWarehouseMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: WAREHOUSES });
    return {
        create: useMutation({
            mutationFn: (p: { name: string; description?: string }) => warehouseApi.create(p),
            onSuccess: inv,
        }),
        update: useMutation({
            mutationFn: (v: { id: number; name: string; description?: string }) =>
                warehouseApi.update(v.id, { name: v.name, description: v.description }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => warehouseApi.remove(id), onSuccess: inv }),
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/hooks/use-master-data.ts
git commit -m "feat: add master data React Query hooks"
```

---

## Task 9: i18n Keys

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add English keys**

In the English section (around line 265, after `add_location: 'Add location'`), add:

```ts
    // Master Data
    set_master_data: 'Master Data',
    set_master_data_desc: 'Shared lookup tables for Assets, Contracts, and Stock modules.',
    md_brands: 'Brands',
    md_models: 'Models',
    md_categories: 'Categories',
    md_vendors: 'Supplier / Vendor',
    md_warehouses: 'Warehouse',
    md_add_brand: 'Add brand',
    md_add_model: 'Add model',
    md_add_category: 'Add category',
    md_add_vendor: 'Add vendor',
    md_add_warehouse: 'Add warehouse',
    md_brand_name: 'Brand name',
    md_model_name: 'Model name',
    md_category_name: 'Category name',
    md_vendor_name: 'Vendor name',
    md_warehouse_name: 'Warehouse name',
    md_description: 'Description (optional)',
    md_brand: 'Brand',
    md_type: 'Type',
    md_contact: 'Contact person',
    md_phone: 'Phone',
    md_email: 'Email',
    md_address: 'Address',
    md_type_asset: 'Asset',
    md_type_contract: 'Contract',
    md_type_stock: 'Stock',
```

- [ ] **Step 2: Add Thai keys**

In the Thai section (around line 697, after `add_location`), add:

```ts
    // Master Data
    set_master_data: 'ข้อมูลหลัก',
    set_master_data_desc: 'ตารางข้อมูลอ้างอิงสำหรับโมดูล ทรัพย์สิน สัญญา และคลังสินค้า',
    md_brands: 'แบรนด์',
    md_models: 'รุ่น',
    md_categories: 'หมวดหมู่',
    md_vendors: 'ซัพพลายเออร์ / ผู้จำหน่าย',
    md_warehouses: 'คลังสินค้า',
    md_add_brand: 'เพิ่มแบรนด์',
    md_add_model: 'เพิ่มรุ่น',
    md_add_category: 'เพิ่มหมวดหมู่',
    md_add_vendor: 'เพิ่มผู้จำหน่าย',
    md_add_warehouse: 'เพิ่มคลังสินค้า',
    md_brand_name: 'ชื่อแบรนด์',
    md_model_name: 'ชื่อรุ่น',
    md_category_name: 'ชื่อหมวดหมู่',
    md_vendor_name: 'ชื่อผู้จำหน่าย',
    md_warehouse_name: 'ชื่อคลังสินค้า',
    md_description: 'คำอธิบาย (ไม่บังคับ)',
    md_brand: 'แบรนด์',
    md_type: 'ประเภท',
    md_contact: 'ผู้ติดต่อ',
    md_phone: 'โทรศัพท์',
    md_email: 'อีเมล',
    md_address: 'ที่อยู่',
    md_type_asset: 'ทรัพย์สิน',
    md_type_contract: 'สัญญา',
    md_type_stock: 'คลังสินค้า',
```

- [ ] **Step 3: Commit**

```bash
git add resources/js/lib/i18n.ts
git commit -m "feat: add master data i18n keys (EN + TH)"
```

---

## Task 10: Settings UI – MasterDataTab

**Files:**
- Modify: `resources/js/pages/settings/index.tsx`

This is the largest task. Work through it in sub-steps.

- [ ] **Step 1: Update imports at the top of `settings/index.tsx`**

Add to the existing lucide import list: `Archive`, `Boxes`, `ShoppingCart`, `Tag`, `Layers`

Add to the existing hook imports at the top:
```ts
import {
    useAssetModelMutations,
    useAssetModels,
    useBrandMutations,
    useBrands,
    useCategoryMutations,
    useCategories,
    useVendorMutations,
    useVendors,
    useWarehouseMutations,
    useWarehouses,
} from '@/hooks/use-master-data';
import type { AssetModel, Brand, Category, CategoryType, Vendor, Warehouse } from '@/types';
```

- [ ] **Step 2: Update the Section type**

Change:
```ts
type Section = 'display' | 'company' | 'branding' | 'locations' | 'email' | 'tickets' | 'assets' | 'workflow' | 'integrations' | 'security';
```
To:
```ts
type Section = 'display' | 'company' | 'branding' | 'master-data' | 'email' | 'tickets' | 'assets' | 'workflow' | 'integrations' | 'security';
```

- [ ] **Step 3: Update VALID_SECTIONS**

Change:
```ts
const VALID_SECTIONS: Section[] = [
    'display', 'company', 'branding', 'locations', 'email', 'tickets', 'assets', 'workflow', 'integrations', 'security',
];
```
To:
```ts
const VALID_SECTIONS: Section[] = [
    'display', 'company', 'branding', 'master-data', 'email', 'tickets', 'assets', 'workflow', 'integrations', 'security',
];
```

- [ ] **Step 4: Update the nav array**

Replace the `locations` nav entry:
```ts
{ id: 'locations', label: t('set_locations'), icon: MapPin, ready: true },
```
With:
```ts
{ id: 'master-data', label: t('set_master_data'), icon: Boxes, ready: true },
```

Remove the `MapPin` import if it's no longer used elsewhere (check first — it's used inside `LocationsList`).

- [ ] **Step 5: Update the section renderer**

Replace:
```tsx
{section === 'locations' && <LocationsTab />}
```
With:
```tsx
{section === 'master-data' && <MasterDataTab />}
```

Also update the guard at the bottom:
```tsx
{!['display', 'company', 'branding', 'locations', 'email', 'security'].includes(section) && <ComingSoon />}
```
To:
```tsx
{!['display', 'company', 'branding', 'master-data', 'email', 'security'].includes(section) && <ComingSoon />}
```

- [ ] **Step 6: Add MasterDataTab component**

Add these components before the existing `LocationsTab` function (or after `ComingSoon`):

```tsx
type MdTab = 'brands' | 'models' | 'categories' | 'vendors' | 'warehouses' | 'locations';

function MasterDataTab() {
    const t = useT();
    const [tab, setTab] = useState<MdTab>('brands');

    const tabs: { id: MdTab; label: string }[] = [
        { id: 'brands', label: t('md_brands') },
        { id: 'models', label: t('md_models') },
        { id: 'categories', label: t('md_categories') },
        { id: 'vendors', label: t('md_vendors') },
        { id: 'warehouses', label: t('md_warehouses') },
        { id: 'locations', label: t('set_locations') },
    ];

    return (
        <div>
            <div className="mb-5">
                <h2 className="text-lg font-semibold">{t('set_master_data')}</h2>
                <p className="text-muted-foreground text-sm">{t('set_master_data_desc')}</p>
            </div>

            <div className="mb-5 flex flex-wrap gap-1 border-b pb-3">
                {tabs.map((tb) => (
                    <button
                        key={tb.id}
                        onClick={() => setTab(tb.id)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tab === tb.id ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-accent/50',
                        )}
                    >
                        {tb.label}
                    </button>
                ))}
            </div>

            {tab === 'brands' && <BrandsList />}
            {tab === 'models' && <ModelsList />}
            {tab === 'categories' && <CategoriesList />}
            {tab === 'vendors' && <VendorsList />}
            {tab === 'warehouses' && <WarehousesList />}
            {tab === 'locations' && <LocationsList />}
        </div>
    );
}
```

- [ ] **Step 7: Add BrandsList component**

```tsx
function BrandsList() {
    const t = useT();
    const { data: brands = [] } = useBrands();
    const { create, update, remove } = useBrandMutations();
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const add = async () => {
        if (!newName.trim()) return;
        await create.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined });
        setNewName('');
        setNewDesc('');
    };

    const saveEdit = async () => {
        if (editId == null || !editName.trim()) return;
        await update.mutateAsync({ id: editId, name: editName.trim(), description: editDesc.trim() || undefined });
        setEditId(null);
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-4 flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('md_brand_name')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={t('md_description')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Button onClick={add} disabled={!newName.trim() || create.isPending}>
                    <Plus className="h-4 w-4" />
                    {t('md_add_brand')}
                </Button>
            </div>
            <div className="divide-border border-border divide-y rounded-lg border">
                {brands.length === 0 && <div className="text-muted-foreground px-4 py-6 text-center text-sm">—</div>}
                {brands.map((b: Brand) => (
                    <div key={b.id} className="flex items-center gap-2 px-4 py-2.5">
                        {editId === b.id ? (
                            <>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                                <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8" placeholder={t('md_description')} />
                                <Button size="sm" onClick={saveEdit} disabled={update.isPending}>{t('save')}</Button>
                                <button onClick={() => setEditId(null)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1">
                                    <span className="text-sm font-medium">{b.name}</span>
                                    {b.description && <span className="text-muted-foreground ml-2 text-xs">{b.description}</span>}
                                </div>
                                <button onClick={() => { setEditId(b.id); setEditName(b.name); setEditDesc(b.description ?? ''); }} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={() => { if (confirm(`${t('confirm_delete')} ${b.name}`)) remove.mutate(b.id); }} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 8: Add ModelsList component**

```tsx
function ModelsList() {
    const t = useT();
    const { data: models = [] } = useAssetModels();
    const { data: brands = [] } = useBrands();
    const { create, update, remove } = useAssetModelMutations();
    const [newName, setNewName] = useState('');
    const [newBrandId, setNewBrandId] = useState<string>('');
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editBrandId, setEditBrandId] = useState<string>('');

    const add = async () => {
        if (!newName.trim()) return;
        await create.mutateAsync({ name: newName.trim(), brand_id: newBrandId ? Number(newBrandId) : null });
        setNewName('');
        setNewBrandId('');
    };

    const saveEdit = async () => {
        if (editId == null || !editName.trim()) return;
        await update.mutateAsync({ id: editId, name: editName.trim(), brand_id: editBrandId ? Number(editBrandId) : null });
        setEditId(null);
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-4 flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('md_model_name')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Select value={newBrandId} onValueChange={setNewBrandId}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder={t('md_brand')} />
                    </SelectTrigger>
                    <SelectContent>
                        {brands.map((b: Brand) => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={add} disabled={!newName.trim() || create.isPending}>
                    <Plus className="h-4 w-4" />
                    {t('md_add_model')}
                </Button>
            </div>
            <div className="divide-border border-border divide-y rounded-lg border">
                {models.length === 0 && <div className="text-muted-foreground px-4 py-6 text-center text-sm">—</div>}
                {models.map((m: AssetModel) => (
                    <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
                        {editId === m.id ? (
                            <>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                                <Select value={editBrandId} onValueChange={setEditBrandId}>
                                    <SelectTrigger className="h-8 w-36">
                                        <SelectValue placeholder={t('md_brand')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {brands.map((b: Brand) => (
                                            <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" onClick={saveEdit} disabled={update.isPending}>{t('save')}</Button>
                                <button onClick={() => setEditId(null)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1">
                                    <span className="text-sm font-medium">{m.name}</span>
                                    {m.brand && (
                                        <span className="bg-accent text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-xs">{m.brand.name}</span>
                                    )}
                                </div>
                                <button onClick={() => { setEditId(m.id); setEditName(m.name); setEditBrandId(m.brand_id ? String(m.brand_id) : ''); }} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={() => { if (confirm(`${t('confirm_delete')} ${m.name}`)) remove.mutate(m.id); }} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 9: Add CategoriesList component**

```tsx
const CATEGORY_TYPE_COLORS: Record<CategoryType, string> = {
    asset: 'bg-blue-100 text-blue-700',
    contract: 'bg-purple-100 text-purple-700',
    stock: 'bg-green-100 text-green-700',
};

function CategoriesList() {
    const t = useT();
    const { data: categories = [] } = useCategories();
    const { create, update, remove } = useCategoryMutations();
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<string>('asset');
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editType, setEditType] = useState<string>('asset');

    const add = async () => {
        if (!newName.trim()) return;
        await create.mutateAsync({ name: newName.trim(), type: newType });
        setNewName('');
        setNewType('asset');
    };

    const saveEdit = async () => {
        if (editId == null || !editName.trim()) return;
        await update.mutateAsync({ id: editId, name: editName.trim(), type: editType });
        setEditId(null);
    };

    const typeOptions = [
        { value: 'asset', label: t('md_type_asset') },
        { value: 'contract', label: t('md_type_contract') },
        { value: 'stock', label: t('md_type_stock') },
    ];

    return (
        <div className="max-w-2xl">
            <div className="mb-4 flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('md_category_name')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={add} disabled={!newName.trim() || create.isPending}>
                    <Plus className="h-4 w-4" />
                    {t('md_add_category')}
                </Button>
            </div>
            <div className="divide-border border-border divide-y rounded-lg border">
                {categories.length === 0 && <div className="text-muted-foreground px-4 py-6 text-center text-sm">—</div>}
                {categories.map((c: Category) => (
                    <div key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                        {editId === c.id ? (
                            <>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                                <Select value={editType} onValueChange={setEditType}>
                                    <SelectTrigger className="h-8 w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" onClick={saveEdit} disabled={update.isPending}>{t('save')}</Button>
                                <button onClick={() => setEditId(null)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="text-sm font-medium">{c.name}</span>
                                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CATEGORY_TYPE_COLORS[c.type])}>
                                        {t(`md_type_${c.type}` as keyof ReturnType<typeof useT>)}
                                    </span>
                                </div>
                                <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditType(c.type); }} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={() => { if (confirm(`${t('confirm_delete')} ${c.name}`)) remove.mutate(c.id); }} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 10: Add VendorsList component**

```tsx
function VendorsList() {
    const t = useT();
    const { data: vendors = [] } = useVendors();
    const { create, update, remove } = useVendorMutations();

    const emptyForm = { name: '', contact: '', phone: '', email: '', address: '' };
    const [newForm, setNewForm] = useState(emptyForm);
    const [editId, setEditId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState(emptyForm);

    const setNew = (k: keyof typeof emptyForm, v: string) => setNewForm((f) => ({ ...f, [k]: v }));
    const setEdit = (k: keyof typeof emptyForm, v: string) => setEditForm((f) => ({ ...f, [k]: v }));

    const add = async () => {
        if (!newForm.name.trim()) return;
        await create.mutateAsync({
            name: newForm.name.trim(),
            contact: newForm.contact.trim() || undefined,
            phone: newForm.phone.trim() || undefined,
            email: newForm.email.trim() || undefined,
            address: newForm.address.trim() || undefined,
        });
        setNewForm(emptyForm);
    };

    const saveEdit = async () => {
        if (editId == null || !editForm.name.trim()) return;
        await update.mutateAsync({
            id: editId,
            name: editForm.name.trim(),
            contact: editForm.contact.trim() || undefined,
            phone: editForm.phone.trim() || undefined,
            email: editForm.email.trim() || undefined,
            address: editForm.address.trim() || undefined,
        });
        setEditId(null);
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-4 space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                    <Input value={newForm.name} onChange={(e) => setNew('name', e.target.value)} placeholder={t('md_vendor_name')} />
                    <Input value={newForm.contact} onChange={(e) => setNew('contact', e.target.value)} placeholder={t('md_contact')} />
                </div>
                <div className="flex gap-2">
                    <Input value={newForm.phone} onChange={(e) => setNew('phone', e.target.value)} placeholder={t('md_phone')} />
                    <Input value={newForm.email} onChange={(e) => setNew('email', e.target.value)} placeholder={t('md_email')} type="email" />
                </div>
                <div className="flex gap-2">
                    <Input value={newForm.address} onChange={(e) => setNew('address', e.target.value)} placeholder={t('md_address')} />
                    <Button onClick={add} disabled={!newForm.name.trim() || create.isPending} className="shrink-0">
                        <Plus className="h-4 w-4" />
                        {t('md_add_vendor')}
                    </Button>
                </div>
            </div>
            <div className="divide-border border-border divide-y rounded-lg border">
                {vendors.length === 0 && <div className="text-muted-foreground px-4 py-6 text-center text-sm">—</div>}
                {vendors.map((v: Vendor) => (
                    <div key={v.id} className="px-4 py-2.5">
                        {editId === v.id ? (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} className="h-8" autoFocus placeholder={t('md_vendor_name')} />
                                    <Input value={editForm.contact} onChange={(e) => setEdit('contact', e.target.value)} className="h-8" placeholder={t('md_contact')} />
                                </div>
                                <div className="flex gap-2">
                                    <Input value={editForm.phone} onChange={(e) => setEdit('phone', e.target.value)} className="h-8" placeholder={t('md_phone')} />
                                    <Input value={editForm.email} onChange={(e) => setEdit('email', e.target.value)} className="h-8" placeholder={t('md_email')} type="email" />
                                </div>
                                <div className="flex gap-2">
                                    <Input value={editForm.address} onChange={(e) => setEdit('address', e.target.value)} className="h-8 flex-1" placeholder={t('md_address')} />
                                    <Button size="sm" onClick={saveEdit} disabled={update.isPending}>{t('save')}</Button>
                                    <button onClick={() => setEditId(null)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2">
                                <div className="flex-1">
                                    <div className="text-sm font-medium">{v.name}</div>
                                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                                        {v.contact && <span>{v.contact}</span>}
                                        {v.phone && <span>{v.phone}</span>}
                                        {v.email && <span>{v.email}</span>}
                                        {v.address && <span>{v.address}</span>}
                                    </div>
                                </div>
                                <button onClick={() => { setEditId(v.id); setEditForm({ name: v.name, contact: v.contact ?? '', phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '' }); }} className="hover:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={() => { if (confirm(`${t('confirm_delete')} ${v.name}`)) remove.mutate(v.id); }} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 11: Add WarehousesList component**

```tsx
function WarehousesList() {
    const t = useT();
    const { data: warehouses = [] } = useWarehouses();
    const { create, update, remove } = useWarehouseMutations();
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const add = async () => {
        if (!newName.trim()) return;
        await create.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined });
        setNewName('');
        setNewDesc('');
    };

    const saveEdit = async () => {
        if (editId == null || !editName.trim()) return;
        await update.mutateAsync({ id: editId, name: editName.trim(), description: editDesc.trim() || undefined });
        setEditId(null);
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-4 flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('md_warehouse_name')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={t('md_description')} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <Button onClick={add} disabled={!newName.trim() || create.isPending}>
                    <Plus className="h-4 w-4" />
                    {t('md_add_warehouse')}
                </Button>
            </div>
            <div className="divide-border border-border divide-y rounded-lg border">
                {warehouses.length === 0 && <div className="text-muted-foreground px-4 py-6 text-center text-sm">—</div>}
                {warehouses.map((w: Warehouse) => (
                    <div key={w.id} className="flex items-center gap-2 px-4 py-2.5">
                        {editId === w.id ? (
                            <>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                                <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8" placeholder={t('md_description')} />
                                <Button size="sm" onClick={saveEdit} disabled={update.isPending}>{t('save')}</Button>
                                <button onClick={() => setEditId(null)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1">
                                    <span className="text-sm font-medium">{w.name}</span>
                                    {w.description && <span className="text-muted-foreground ml-2 text-xs">{w.description}</span>}
                                </div>
                                <button onClick={() => { setEditId(w.id); setEditName(w.name); setEditDesc(w.description ?? ''); }} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button onClick={() => { if (confirm(`${t('confirm_delete')} ${w.name}`)) remove.mutate(w.id); }} className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 12: Add LocationsList (rename existing LocationsTab)**

Rename the existing `LocationsTab` function to `LocationsList` and keep its logic unchanged:

```tsx
function LocationsList() {
    // ... same body as the existing LocationsTab function
}
```

The existing `LocationsTab` function can be removed or kept (it's now unreferenced since the nav no longer points to `section === 'locations'`). Remove it to avoid dead code.

- [ ] **Step 13: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before continuing.

- [ ] **Step 14: Build frontend**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 15: Commit**

```bash
git add resources/js/pages/settings/index.tsx resources/js/hooks/use-master-data.ts resources/js/services/masterDataApi.ts resources/js/types/index.ts resources/js/lib/i18n.ts
git commit -m "feat: add Master Data tab to Settings (Brands, Models, Categories, Vendors, Warehouses, Locations)"
```
