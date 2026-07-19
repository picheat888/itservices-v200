<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AssetApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Create an asset model (Master Data) and return its id — asset POSTs now send model_id. */
    private function modelId(string $name = 'Test Model'): int
    {
        return AssetModel::create(['name' => $name])->id;
    }

    /**
     * Resolve a category (Master Data) by name and return its id — asset POSTs send category_id.
     * Uses firstOrCreate (idempotent, like AssetFactory) so it never collides on categories.name
     * with a category the factory already created for the same test.
     */
    private function categoryId(string $name = 'Laptop'): int
    {
        return Category::firstOrCreate(['name' => $name])->id;
    }

    /** Create a vendor (Master Data) and return its id — purchased asset POSTs now send vendor_id. */
    private function vendorId(string $name = 'Acme Vendor'): int
    {
        return Vendor::create(['name' => $name])->id;
    }

    public function test_guests_cannot_list_assets(): void
    {
        $this->getJson('/api/assets')->assertUnauthorized();
    }

    public function test_super_can_register_and_list_an_asset(): void
    {
        $this->actingAs($this->super());

        $payload = [
            'category_id' => $this->categoryId('laptop'),
            'source' => 'purchased',
            'model_id' => $this->modelId('Dell Latitude 5440'),
            'vendor_id' => $this->vendorId(),
            'owner' => 'EMP-1042',
            'value' => 32100,
            'purchase_date' => '2025-01-10',
            'warranty_end' => '2028-01-10',
        ];

        $this->postJson('/api/assets', $payload)
            ->assertCreated()
            ->assertJsonPath('data.model', 'Dell Latitude 5440')
            ->assertJsonPath('data.value_display', '฿32,100')
            ->assertJsonPath('data.status', 'ready')
            // "Registered" reflects when the row was created in this system (created_at).
            ->assertJsonPath('data.registered_date', now()->toDateString());

        $this->getJson('/api/assets')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_asset_code_is_auto_generated_when_blank(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('X'), 'vendor_id' => $this->vendorId(), 'value' => 100,
        ])->assertCreated()
            ->assertJsonPath('data.asset_code', fn ($assetCode) => is_string($assetCode) && str_starts_with($assetCode, 'INK-IT-'));
    }

    public function test_rented_asset_derives_value_and_dates_from_contract(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31',
            'value' => 8500, 'billing_cycle' => 'monthly',
        ]);

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('network'), 'source' => 'rented', 'model_id' => $this->modelId('Cisco 9300'), 'contract_id' => $contract->id,
        ])->assertCreated()
            ->assertJsonPath('data.value_display', '฿8,500/mo')
            ->assertJsonPath('data.supplier', 'SVOA')
            ->assertJsonPath('data.lease_start', '2026-01-01')
            ->assertJsonPath('data.lease_end', '2027-12-31')
            ->assertJsonPath('data.contract_id', $contract->id)
            ->assertJsonPath('data.asset_code', fn ($assetCode) => str_starts_with($assetCode, 'INK-IT-'));
    }

    public function test_rented_asset_does_not_snapshot_lease_fields_on_its_own_row(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31',
            'value' => 8500, 'billing_cycle' => 'monthly',
        ]);

        // Even when a client sends a fee / vendor, they must not be persisted onto the
        // rented asset — the contract is the single source of truth.
        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('network'), 'source' => 'rented',
            'model_id' => $this->modelId('Cisco 9300'), 'contract_id' => $contract->id,
            'value' => 999, 'vendor_id' => $this->vendorId('Sneaky'),
        ])->assertCreated();

        $this->assertDatabaseHas('assets', [
            'source' => 'rented',
            'contract_id' => $contract->id,
            'value' => 0,
            'vendor_id' => null,
        ]);
    }

    public function test_summary_total_value_counts_a_rented_fee_from_the_contract(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'vendor_id' => $this->vendorId('Lease Co'), 'name' => 'Rack lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31',
            'value' => 1000, 'billing_cycle' => 'monthly',
        ]);
        // Asset stores no fee of its own; annualValue must read 1000/mo ×12 from the contract.
        Asset::factory()->create([
            'source' => 'rented', 'contract_id' => $contract->id,
            'value' => 0, 'vendor_id' => null,
        ]);

        $this->getJson('/api/assets/summary')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('total_value', 12000);
    }

    public function test_rented_asset_requires_a_contract(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'type' => 'network', 'source' => 'rented', 'model' => 'Cisco 9300',
        ])->assertStatus(422)->assertJsonValidationErrors('contract_id');
    }

    public function test_lifetime_warranty_clears_the_end_date(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('printer'), 'source' => 'purchased', 'model_id' => $this->modelId('Brother HL'), 'vendor_id' => $this->vendorId(), 'value' => 5000,
            'warranty_end' => '2030-01-01', 'warranty_lifetime' => true,
        ])->assertCreated()
            ->assertJsonPath('data.warranty_lifetime', true)
            ->assertJsonPath('data.warranty_end', null);
    }

    public function test_value_display_uses_the_configured_currency_symbol(): void
    {
        AppSetting::put('currency', 'USD');
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('MacBook Pro'), 'vendor_id' => $this->vendorId(), 'value' => 32100,
        ])->assertCreated()
            ->assertJsonPath('data.value_display', '$32,100');
    }

    public function test_model_is_required(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', ['type' => 'laptop', 'source' => 'purchased', 'value' => 1])
            ->assertStatus(422)->assertJsonValidationErrors('model_id');
    }

    public function test_renaming_a_brand_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        // Names outside AssetFactory's random brand set to avoid a unique-name clash.
        $brand = Brand::create(['name' => 'Zeta Corp']);
        $asset = Asset::factory()->create(['brand_id' => $brand->id]);

        $brand->update(['name' => 'Zeta Industries']);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.brand', 'Zeta Industries');
    }

    public function test_renaming_a_model_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        $model = AssetModel::create(['name' => 'Old Model']);
        $asset = Asset::factory()->create(['model_id' => $model->id]);

        $model->update(['name' => 'New Model']);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.model', 'New Model');
    }

    public function test_brand_in_use_by_an_asset_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $brand = Brand::create(['name' => 'In Use']);
        Asset::factory()->create(['brand_id' => $brand->id]);

        $this->deleteJson("/api/brands/{$brand->id}")->assertStatus(409);
        $this->assertDatabaseHas('brands', ['id' => $brand->id]);
    }

    public function test_asset_model_in_use_by_an_asset_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $model = AssetModel::create(['name' => 'In Use Model']);
        Asset::factory()->create(['model_id' => $model->id]);

        $this->deleteJson("/api/asset-models/{$model->id}")->assertStatus(409);
        $this->assertDatabaseHas('asset_models', ['id' => $model->id]);
    }

    public function test_renaming_a_category_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        // Name outside AssetFactory's random type set to avoid a duplicate-name clash.
        $category = Category::create(['name' => 'Widgets']);
        $asset = Asset::factory()->create(['category_id' => $category->id]);

        $category->update(['name' => 'Gadgets']);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.type', 'Gadgets');
    }

    public function test_category_in_use_by_an_asset_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $category = Category::create(['name' => 'In Use Category']);
        Asset::factory()->create(['category_id' => $category->id]);

        $this->deleteJson("/api/categories/{$category->id}")->assertStatus(409);
        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }

    /**
     * Regression: the categoryId() test helper must be idempotent. AssetFactory creates
     * its category via Category::firstOrCreate over a random set that includes 'laptop';
     * when the helper later asks for the same name it must reuse that row, not INSERT a
     * duplicate (which threw UniqueConstraintViolationException on categories.name and made
     * the suite flaky depending on the factory's random roll / test order).
     */
    public function test_category_helper_is_idempotent_with_a_preexisting_category(): void
    {
        // Simulate the factory having already created the 'laptop' category.
        Category::firstOrCreate(['name' => 'laptop']);

        $id = $this->categoryId('laptop');

        $this->assertIsInt($id);
        $this->assertSame(1, Category::where('name', 'laptop')->count());
    }

    public function test_renaming_a_vendor_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'Old Supplier']);
        $asset = Asset::factory()->create(['vendor_id' => $vendor->id]);

        $vendor->update(['name' => 'New Supplier']);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.supplier', 'New Supplier');
    }

    public function test_vendor_in_use_by_an_asset_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'In Use Supplier']);
        Asset::factory()->create(['vendor_id' => $vendor->id]);

        $this->deleteJson("/api/vendors/{$vendor->id}")->assertStatus(409);
        $this->assertDatabaseHas('vendors', ['id' => $vendor->id]);
    }

    public function test_renaming_a_warehouse_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        $warehouse = Warehouse::create(['name' => 'Old Store']);
        $asset = Asset::factory()->create(['warehouse_id' => $warehouse->id]);

        $warehouse->update(['name' => 'New Store']);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.warehouse', 'New Store');
    }

    public function test_warehouse_in_use_by_an_asset_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $warehouse = Warehouse::create(['name' => 'In Use Store']);
        Asset::factory()->create(['warehouse_id' => $warehouse->id]);

        $this->deleteJson("/api/warehouses/{$warehouse->id}")->assertStatus(409);
        $this->assertDatabaseHas('warehouses', ['id' => $warehouse->id]);
    }

    public function test_user_without_permission_cannot_register(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->postJson('/api/assets', [
            'type' => 'laptop', 'source' => 'purchased', 'model' => 'X', 'value' => 1,
        ])->assertForbidden();
    }

    public function test_transfer_employee_mode_sets_fk_and_pends_acceptance(): void
    {
        $employee = Employee::create(['code' => 'EMP-4001', 'first_name' => 'New', 'last_name' => 'Hire']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT', 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_acceptance')
            ->assertJsonPath('data.owner', 'EMP-4001')
            ->assertJsonPath('data.owner_employee_id', $employee->id)
            ->assertJsonPath('data.location', 'HQ Floor 3');
    }

    public function test_transfer_to_employee_clears_the_warehouse(): void
    {
        $employee = Employee::create(['code' => 'EMP-7700', 'first_name' => 'Ware', 'last_name' => 'House']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create([
            'status' => 'ready', 'owner' => null, 'owner_employee_id' => null,
            'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id,
        ]);
        $location = Location::create(['name' => 'HQ Floor 3']);

        // Deploying to an employee moves the asset out of the pool: it's now at a
        // usage location, so the warehouse must be cleared.
        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.owner', 'EMP-7700')
            ->assertJsonPath('data.location', 'HQ Floor 3')
            ->assertJsonPath('data.warehouse', null);
    }

    public function test_receiving_to_pool_clears_the_usage_location(): void
    {
        $employee = Employee::create(['code' => 'EMP-7701', 'first_name' => 'Back', 'last_name' => 'Pool']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create([
            'status' => 'pending_return', 'owner' => 'EMP-7701', 'owner_employee_id' => $employee->id,
            'location_id' => Location::create(['name' => 'HQ Floor 3'])->id,
        ]);

        // Back in a warehouse → it is no longer deployed at a usage location.
        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.warehouse', 'Central IT')
            ->assertJsonPath('data.location', null);
    }

    public function test_transfer_shared_mode_deploys_without_an_employee(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'Server Room']);

        // Shared / common-use goes to the distinct `common` status (not `deployed`).
        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'shared', 'owner_label' => 'Rack 2', 'location_id' => $location->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'common')
            ->assertJsonPath('data.owner', 'Rack 2')
            ->assertJsonPath('data.owner_employee_id', null);
    }

    public function test_transfer_employee_mode_requires_owner_employee_id(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready']);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'location_id' => $location->id])
            ->assertStatus(422)->assertJsonValidationErrors('owner_employee_id');
    }

    public function test_transfer_shared_mode_requires_owner_label(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready']);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'shared', 'location_id' => $location->id])
            ->assertStatus(422)->assertJsonValidationErrors('owner_label');
    }

    public function test_transfer_moves_asset_to_pending_acceptance(): void
    {
        $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT', 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire'])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_acceptance')
            ->assertJsonPath('data.owner', 'EMP-2000')
            ->assertJsonPath('data.location', 'HQ Floor 3')
            ->assertJsonPath('data.location_id', $location->id);
    }

    public function test_transfer_requires_a_location(): void
    {
        $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id])
            ->assertStatus(422)->assertJsonValidationErrors('location_id');
    }

    public function test_my_assets_returns_only_the_users_own_assets(): void
    {
        $employee = Employee::create(['code' => 'EMP-7001', 'first_name' => 'Me', 'last_name' => 'User']);
        $other = Employee::create(['code' => 'EMP-9999', 'first_name' => 'Not', 'last_name' => 'Me']);
        $user = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.my', 'allowed' => true]);
        Asset::factory()->create(['owner' => 'EMP-7001', 'owner_employee_id' => $employee->id]);
        Asset::factory()->create(['owner' => 'EMP-7001', 'owner_employee_id' => $employee->id]);
        Asset::factory()->create(['owner' => 'EMP-9999', 'owner_employee_id' => $other->id]);

        $this->actingAs($user);
        $this->getJson('/api/assets/mine')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_only_the_recipient_employee_can_accept_a_handover(): void
    {
        $employee = Employee::create(['code' => 'EMP-9001', 'first_name' => 'Rec', 'last_name' => 'Ipient']);
        $recipient = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        $asset = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-9001', 'owner_employee_id' => $employee->id]);

        // IT / anyone who is not the recipient cannot accept on their behalf.
        $this->actingAs($this->super());
        $this->postJson("/api/assets/{$asset->id}/accept")->assertForbidden();

        // The recipient can accept — the asset deploys and gets a possession date.
        $this->actingAs($recipient);
        $this->postJson("/api/assets/{$asset->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'deployed')
            ->assertJsonPath('data.owned_since', fn ($d) => is_string($d) && $d !== '');
    }

    public function test_transfer_notifies_the_recipient_employee(): void
    {
        $employee = Employee::create(['code' => 'EMP-8001', 'first_name' => 'New', 'last_name' => 'Owner']);
        $recipient = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        RolePermission::create(['role_id' => $recipient->role_id, 'permission' => 'assets.my', 'allowed' => true]);
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);
        $location = Location::create(['name' => 'HQ']);

        $this->actingAs($this->super());
        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])->assertOk();

        $this->assertSame(1, $recipient->fresh()->notifications()->count());
        $this->assertSame('asset_assigned', $recipient->notifications()->first()->data['type']);
    }

    public function test_cannot_transfer_a_deployed_asset(): void
    {
        $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1042']);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertStatus(422);
    }

    public function test_holder_can_request_return_of_their_asset(): void
    {
        $employee = Employee::create(['code' => 'EMP-6001', 'first_name' => 'Hold', 'last_name' => 'Er']);
        $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        RolePermission::create(['role_id' => $holder->role_id, 'permission' => 'assets.return', 'allowed' => true]);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6001', 'owner_employee_id' => $employee->id]);

        // Anyone who is not the holder cannot request its return.
        $this->actingAs($this->super());
        $this->postJson("/api/assets/{$asset->id}/request-return")->assertForbidden();

        // The holder can — it goes to pending return (still theirs until IT receives it).
        $this->actingAs($holder);
        $this->postJson("/api/assets/{$asset->id}/request-return")
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_return')
            ->assertJsonPath('data.owner', 'EMP-6001');
    }

    /** Requesting a return is gated by assets.return — the holder without it is forbidden. */
    public function test_request_return_requires_the_return_permission(): void
    {
        $employee = Employee::create(['code' => 'EMP-6002', 'first_name' => 'No', 'last_name' => 'Perm']);
        $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6002', 'owner_employee_id' => $employee->id]);

        $this->actingAs($holder);
        $this->postJson("/api/assets/{$asset->id}/request-return")->assertForbidden();
        $this->assertSame('deployed', $asset->fresh()->status->value);
    }

    public function test_return_request_notifies_it_receivers(): void
    {
        $it = $this->super(); // super holds assets.transfer → an IT receiver
        $employee = Employee::create(['code' => 'EMP-6100', 'first_name' => 'H', 'last_name' => 'R']);
        $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        RolePermission::create(['role_id' => $holder->role_id, 'permission' => 'assets.return', 'allowed' => true]);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6100', 'owner_employee_id' => $employee->id]);

        $this->actingAs($holder);
        $this->postJson("/api/assets/{$asset->id}/request-return")->assertOk();

        $this->assertSame(1, $it->fresh()->notifications()->count());
        $this->assertSame('asset_return_requested', $it->notifications()->first()->data['type']);
    }

    public function test_mark_received_returns_asset_to_pool(): void
    {
        $employee = Employee::create(['code' => 'EMP-1500', 'first_name' => 'Ret', 'last_name' => 'Urn']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500', 'owner_employee_id' => $employee->id]);

        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', null)
            ->assertJsonPath('data.owner_employee_id', null)
            ->assertJsonPath('data.owned_since', null);
    }

    public function test_mark_received_stores_asset_in_chosen_warehouse(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500', 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch A'])->id]);

        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', null)
            ->assertJsonPath('data.warehouse', 'Central IT');
    }

    public function test_mark_received_requires_a_destination_warehouse(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch A'])->id]);

        $this->postJson("/api/assets/{$asset->id}/receive")
            ->assertStatus(422)->assertJsonValidationErrors('warehouse');
    }

    public function test_asset_can_be_created_and_filtered_by_warehouse(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('Dell 5440'), 'vendor_id' => $this->vendorId(), 'value' => 100, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id,
        ])->assertCreated()->assertJsonPath('data.warehouse', 'Central IT');

        Asset::factory()->create(['warehouse_id' => Warehouse::firstOrCreate(['name' => 'Branch A'])->id]);

        $this->getJson('/api/assets?warehouse=Central IT')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.warehouse', 'Central IT');
    }

    public function test_summary_reports_status_counts(): void
    {
        $this->actingAs($this->super());
        Asset::factory()->create(['status' => 'deployed', 'value' => 40000]);
        Asset::factory()->create(['status' => 'ready', 'value' => 20000]);
        Asset::factory()->create(['status' => 'pending_return', 'value' => 10000]);

        $this->getJson('/api/assets/summary')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('deployed', 1)
            ->assertJsonPath('ready', 1)
            ->assertJsonPath('pending_return', 1);
    }

    public function test_bulk_writeoff_updates_many_assets(): void
    {
        $this->actingAs($this->super());
        $a = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
        $b = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk', ['ids' => [$a->id, $b->id], 'op' => 'writeoff', 'reason' => 'EOL'])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame('writeoff', $a->fresh()->status->value);
    }

    public function test_bulk_writeoff_blocked_while_an_asset_is_employee_held(): void
    {
        $employee = Employee::create(['code' => 'EMP-5001', 'first_name' => 'Hol', 'last_name' => 'Der']);
        $this->actingAs($this->super());
        $held = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-5001', 'owner_employee_id' => $employee->id]);
        $free = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk', ['ids' => [$held->id, $free->id], 'op' => 'writeoff', 'reason' => 'EOL'])
            ->assertStatus(422);

        // No partial write-off — the whole batch is rejected.
        $this->assertSame('deployed', $held->fresh()->status->value);
        $this->assertSame('ready', $free->fresh()->status->value);
    }

    public function test_single_writeoff_blocked_while_employee_held(): void
    {
        $employee = Employee::create(['code' => 'EMP-5002', 'first_name' => 'Hol', 'last_name' => 'Der']);
        $this->actingAs($this->super());
        $held = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-5002', 'owner_employee_id' => $employee->id]);

        $this->postJson('/api/assets/bulk', ['ids' => [$held->id], 'op' => 'writeoff'])
            ->assertStatus(422);

        $this->assertSame('deployed', $held->fresh()->status->value);
    }

    public function test_writeoff_requires_ready_status(): void
    {
        $this->actingAs($this->super());
        $common = Asset::factory()->create(['status' => 'common', 'owner' => 'Rack 2', 'owner_employee_id' => null]);
        $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        // A Common (shared) asset must be recalled to Ready first — the whole batch is rejected.
        $this->postJson('/api/assets/bulk', ['ids' => [$common->id, $ready->id], 'op' => 'writeoff'])
            ->assertStatus(422);
        $this->assertSame('common', $common->fresh()->status->value);
        $this->assertSame('ready', $ready->fresh()->status->value);

        // A Ready asset writes off fine.
        $this->postJson('/api/assets/bulk', ['ids' => [$ready->id], 'op' => 'writeoff'])
            ->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame('writeoff', $ready->fresh()->status->value);
    }

    public function test_super_can_force_recall_an_employee_held_asset(): void
    {
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-FR1', 'first_name' => 'Held', 'last_name' => 'One']);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-FR1', 'owner_employee_id' => $employee->id]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner_employee_id', null);
    }

    public function test_force_recall_permission_recalls_an_employee_held_asset(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.force_recall', 'allowed' => true]);
        $this->actingAs($user);

        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-FR3', 'first_name' => 'Held', 'last_name' => 'Three']);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-FR3', 'owner_employee_id' => $employee->id]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner_employee_id', null);
    }

    public function test_transfer_is_recorded_in_the_transfer_log(): void
    {
        $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
        $this->actingAs($this->super());
        // Pooled asset (no owner) stored in a warehouse.
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire'])->assertOk();

        // The custody trail stamps the origin warehouse as the "from" when it leaves the pool.
        $this->getJson('/api/assets/transfers')
            ->assertOk()
            ->assertJsonPath('data.0.to_owner', 'EMP-2000')
            ->assertJsonPath('data.0.from_owner', 'Central IT')
            ->assertJsonPath('data.0.reason', 'New hire');
    }

    public function test_show_includes_transfer_history_and_related_tickets(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-2000']);

        AssetTransfer::create([
            'asset_id' => $asset->id,
            'asset_tag' => $asset->asset_code,
            'asset_model' => $asset->model?->name,
            'from_owner' => 'Pool — IT',
            'to_owner' => 'EMP-2000',
            'reason' => 'New hire',
            'performed_by' => 'IT Admin',
        ]);

        $handler = User::factory()->create(['name' => 'Somchai IT', 'role' => 'admin']);
        Ticket::factory()->create([
            'related_asset_id' => $asset->id,
            'subject' => 'Screen flickering',
            'priority' => 'high',
            'status' => 'in_progress',
            'assignee_id' => $handler->id,
        ]);

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.transfers.0.to_owner', 'EMP-2000')
            ->assertJsonPath('data.transfers.0.from_owner', 'Pool — IT')
            ->assertJsonPath('data.transfers.0.reason', 'New hire')
            ->assertJsonPath('data.tickets.0.subject', 'Screen flickering')
            ->assertJsonPath('data.tickets.0.priority', 'high')
            ->assertJsonPath('data.tickets.0.status', 'in_progress')
            ->assertJsonPath('data.tickets.0.assignee_name', 'Somchai IT');
    }

    public function test_asset_list_omits_transfer_and_ticket_details(): void
    {
        $this->actingAs($this->super());
        Asset::factory()->create();

        $this->getJson('/api/assets')
            ->assertOk()
            ->assertJsonMissingPath('data.0.transfers')
            ->assertJsonMissingPath('data.0.tickets');
    }

    public function test_renaming_a_location_propagates_to_assets(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'Old Wing']);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1', 'location_id' => $location->id]);

        $location->update(['name' => 'New Wing']);

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.location', 'New Wing');
    }

    public function test_location_in_use_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'In Use']);
        Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1', 'location_id' => $location->id]);

        $this->deleteJson("/api/locations/{$location->id}")->assertStatus(409);
        $this->assertDatabaseHas('locations', ['id' => $location->id]);
    }

    public function test_migration_backfills_owner_employee_id_from_owner_code(): void
    {
        // Simulate legacy data: an asset whose owner string is an employee code but whose
        // FK was never populated. Insert directly so the model's transfer flow doesn't set it.
        $employee = Employee::create(['code' => 'EMP-3300', 'first_name' => 'Legacy', 'last_name' => 'Owner']);
        $asset = Asset::factory()->create(['owner' => 'EMP-3300']);
        Asset::whereKey($asset->id)->update(['owner_employee_id' => null]);

        // Re-run the exact backfill the migration performs (SQLite-safe correlated subquery).
        DB::statement(
            'UPDATE assets SET owner_employee_id = (SELECT id FROM employees WHERE employees.code = assets.owner) '
            .'WHERE owner_employee_id IS NULL AND owner IS NOT NULL'
        );

        $this->assertSame($employee->id, $asset->fresh()->owner_employee_id);
    }

    public function test_held_by_employee_reflects_the_fk(): void
    {
        $held = Asset::factory()->create(['owner_employee_id' => Employee::create(['code' => 'EMP-3301', 'first_name' => 'A', 'last_name' => 'B'])->id]);
        $pool = Asset::factory()->create(['owner_employee_id' => null]);

        $this->assertTrue($held->heldByEmployee());
        $this->assertFalse($pool->heldByEmployee());
    }

    public function test_resource_exposes_owner_employee_id_and_owner_name(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-3302', 'first_name' => 'Han', 'last_name' => 'Solo']);
        $asset = Asset::factory()->create(['owner' => 'EMP-3302', 'owner_employee_id' => $employee->id]);

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.owner_employee_id', $employee->id)
            ->assertJsonPath('data.owner_name', 'Han Solo');
    }

    public function test_registering_with_an_employee_owner_code_links_the_fk(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-4242', 'first_name' => 'Reg', 'last_name' => 'Owner']);

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased',
            'model_id' => $this->modelId('Dell 7420'), 'vendor_id' => $this->vendorId(), 'value' => 100,
            'owner' => 'EMP-4242',
        ])->assertCreated()
            ->assertJsonPath('data.owner', 'EMP-4242')
            ->assertJsonPath('data.owner_employee_id', $employee->id);
    }

    public function test_registering_with_a_shared_label_owner_leaves_the_fk_null(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('printer'), 'source' => 'purchased',
            'model_id' => $this->modelId('Brother X'), 'vendor_id' => $this->vendorId(), 'value' => 100,
            'owner' => 'Rack 2',
        ])->assertCreated()
            ->assertJsonPath('data.owner', 'Rack 2')
            ->assertJsonPath('data.owner_employee_id', null);
    }

    public function test_my_assets_and_accept_follow_the_fk_not_the_owner_string(): void
    {
        // FK points at the caller's employee, but the owner string points elsewhere —
        // the consumer paths must trust the FK, not the display string.
        $me = Employee::create(['code' => 'EMP-FK-1', 'first_name' => 'Fk', 'last_name' => 'Me']);
        $user = User::factory()->create(['role' => 'user', 'employee_id' => $me->id]);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.my', 'allowed' => true]);
        $asset = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-STALE-STRING', 'owner_employee_id' => $me->id]);

        $this->actingAs($user);
        $this->getJson('/api/assets/mine')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson("/api/assets/{$asset->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'deployed');
    }

    /**
     * The linked-contract "peek" endpoint is gated by assets.view — NOT contracts.view — so a
     * user who can view assets can read the contract of an asset they can already see, without
     * any contract-module permission.
     */
    public function test_asset_viewer_can_peek_linked_contract_without_contract_permission(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'assets.view', 'allowed' => true]);

        $contract = Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31',
            'value' => 8500, 'billing_cycle' => 'monthly',
        ]);
        $asset = Asset::factory()->create(['source' => 'rented', 'contract_id' => $contract->id]);

        $this->actingAs($viewer);
        $this->getJson("/api/assets/{$asset->id}/contract")
            ->assertOk()
            ->assertJsonPath('data.id', $contract->id)
            ->assertJsonPath('data.name', 'Network lease');
    }

    /** Without assets.view the peek endpoint is forbidden. */
    public function test_peek_linked_contract_requires_assets_view(): void
    {
        $contract = Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31',
            'value' => 8500, 'billing_cycle' => 'monthly',
        ]);
        $asset = Asset::factory()->create(['source' => 'rented', 'contract_id' => $contract->id]);

        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson("/api/assets/{$asset->id}/contract")->assertForbidden();
    }

    /** An asset with no linked contract returns 404 from the peek endpoint. */
    public function test_peek_linked_contract_returns_404_when_asset_has_no_contract(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['source' => 'purchased', 'contract_id' => null]);

        $this->getJson("/api/assets/{$asset->id}/contract")->assertNotFound();
    }

    /**
     * Recall pulls a not-yet-accepted hand-over back into the pool: pending_acceptance → ready,
     * clearing the intended holder and stamping the chosen warehouse.
     */
    public function test_recall_pulls_a_pending_acceptance_asset_back_into_the_pool(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-RCL-1', 'first_name' => 'Wrong', 'last_name' => 'Person']);
        $asset = Asset::factory()->create([
            'status' => 'pending_acceptance',
            'owner' => null,
            'owner_employee_id' => $employee->id,
            'warehouse_id' => null,
        ]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner_employee_id', null);

        $this->assertDatabaseHas('assets', [
            'id' => $asset->id,
            'status' => 'ready',
            'owner_employee_id' => null,
            'location_id' => null,
        ]);
    }

    /** Recall is gated by assets.transfer. */
    public function test_recall_requires_assets_transfer_permission(): void
    {
        $employee = Employee::create(['code' => 'EMP-RCL-2', 'first_name' => 'Wrong', 'last_name' => 'Person']);
        $asset = Asset::factory()->create(['status' => 'pending_acceptance', 'owner_employee_id' => $employee->id]);

        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])->assertForbidden();
    }

    /** Only a pending hand-over can be recalled — a ready asset is rejected. */
    public function test_recall_rejects_an_asset_that_is_not_pending_acceptance(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])->assertStatus(422);
    }

    /** A shared / common-use asset (deployed, no employee holder) can be recalled back into the pool. */
    public function test_recall_pulls_a_shared_deployed_asset_back_into_the_pool(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create([
            'status' => 'deployed',
            'owner' => 'Rack 2 — HR shared printer',
            'owner_employee_id' => null,
        ]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', null);
    }

    /** Ordinary recall (assets.transfer) rejects an employee-held deployed asset — it returns via
     *  the holder's Request-return flow. Only a force recall (assets.force_recall) overrides this. */
    public function test_recall_rejects_an_employee_held_deployed_asset(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.transfer', 'allowed' => true]);
        $this->actingAs($user);
        $employee = Employee::create(['code' => 'EMP-RCL-3', 'first_name' => 'Holder', 'last_name' => 'Person']);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => null, 'owner_employee_id' => $employee->id]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])->assertStatus(422);
    }

    /**
     * The rented-asset form's contract picker is gated by assets.register/edit — NOT
     * contracts.view — so an asset admin without any Contract-module access can still see
     * the contract list to link a rented asset.
     */
    public function test_asset_registrar_can_list_contract_options_without_contract_permission(): void
    {
        $registrar = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $registrar->role_id, 'permission' => 'assets.register', 'allowed' => true]);

        Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 8500, 'billing_cycle' => 'monthly',
        ]);

        $this->actingAs($registrar);
        $this->getJson('/api/assets/contract-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'SVOA');
    }

    /** Contract options require an asset-management permission (register or edit). */
    public function test_contract_options_forbidden_without_register_or_edit(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/assets/contract-options')->assertForbidden();
    }

    /** Only hardware contracts can hold assets, so the picker offers only those. */
    public function test_contract_options_returns_only_hardware_contracts(): void
    {
        $this->actingAs($this->super());
        Contract::create([
            'vendor_id' => $this->vendorId('HW'), 'name' => 'Laptop lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 5000, 'billing_cycle' => 'monthly',
        ]);
        Contract::create([
            'vendor_id' => $this->vendorId('SW'), 'name' => 'Office 365', 'type' => 'software',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 5000, 'billing_cycle' => 'yearly',
        ]);

        $this->getJson('/api/assets/contract-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'HW');
    }

    /** A rented asset cannot be linked to a non-hardware contract. */
    public function test_rented_asset_rejects_a_non_hardware_contract(): void
    {
        $this->actingAs($this->super());
        $software = Contract::create([
            'vendor_id' => $this->vendorId('SW'), 'name' => 'Office 365', 'type' => 'software',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 5000, 'billing_cycle' => 'yearly',
        ]);

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('network'), 'source' => 'rented',
            'model_id' => $this->modelId('Cisco 9300'), 'contract_id' => $software->id,
        ])->assertStatus(422)->assertJsonValidationErrors('contract_id');
    }

    /**
     * A deployed asset has left the pool (no warehouse), so editing it must succeed without a
     * warehouse — the form no longer forces one for non-pool assets, and the server allows null.
     */
    public function test_editing_a_deployed_asset_saves_without_a_warehouse(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create([
            'status' => 'deployed',
            'source' => 'purchased',
            'warehouse_id' => null,
            'owner' => 'Rack A',
            'owner_employee_id' => null,
        ]);

        $this->putJson("/api/assets/{$asset->id}", [
            'category_id' => $this->categoryId('laptop'),
            'model_id' => $this->modelId('X1 Carbon'),
            'source' => 'purchased',
            'value' => 1000,
            'vendor_id' => $this->vendorId('Acme'),
            'purchase_date' => '2026-01-01',
            'warranty_lifetime' => true,
            'tag' => 'edited-tag',
            // no warehouse_id — a deployed asset isn't in a warehouse
        ])->assertOk();

        $this->assertDatabaseHas('assets', ['id' => $asset->id, 'tag' => 'edited-tag', 'warehouse_id' => null]);
    }

    public function test_bulk_transfer_assigns_ready_assets_to_one_employee(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-BT1', 'first_name' => 'Bulk', 'last_name' => 'Target']);
        $location = Location::create(['name' => 'HQ']);
        $a = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
        $b = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk-transfer', [
            'ids' => [$a->id, $b->id], 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id,
        ])->assertOk()->assertJsonPath('updated', 2);

        $this->assertSame('pending_acceptance', $a->fresh()->status->value);
        $this->assertSame($employee->id, $b->fresh()->owner_employee_id);
    }

    public function test_bulk_transfer_reassigns_common_assets_to_an_employee(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-CT1', 'first_name' => 'C', 'last_name' => 'T']);
        $location = Location::create(['name' => 'HQ']);
        $a = Asset::factory()->create(['status' => 'common', 'owner' => 'Rack 1', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk-transfer', [
            'ids' => [$a->id], 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id,
        ])->assertOk()->assertJsonPath('updated', 1);

        $fresh = $a->fresh();
        $this->assertSame('pending_acceptance', $fresh->status->value);
        $this->assertSame($employee->id, $fresh->owner_employee_id);
        $this->assertNull($fresh->owner); // the shared label is cleared on re-assignment
    }

    public function test_bulk_transfer_shared_mode_marks_assets_common(): void
    {
        $this->actingAs($this->super());
        $location = Location::create(['name' => 'HQ']);
        $a = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
        $b = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk-transfer', [
            'ids' => [$a->id, $b->id], 'mode' => 'shared', 'owner_label' => 'Meeting Room', 'location_id' => $location->id,
        ])->assertOk()->assertJsonPath('updated', 2);

        $this->assertSame('common', $a->fresh()->status->value);
        $this->assertSame('Meeting Room', $b->fresh()->owner);
    }

    public function test_bulk_transfer_rejects_employee_held_assets(): void
    {
        $this->actingAs($this->super());
        $target = Employee::create(['code' => 'EMP-BT2', 'first_name' => 'B', 'last_name' => 'T']);
        $holder = Employee::create(['code' => 'EMP-BT3', 'first_name' => 'H', 'last_name' => 'D']);
        $location = Location::create(['name' => 'HQ']);
        $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
        $held = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-BT3', 'owner_employee_id' => $holder->id]);

        $this->postJson('/api/assets/bulk-transfer', [
            'ids' => [$ready->id, $held->id], 'mode' => 'employee', 'owner_employee_id' => $target->id, 'location_id' => $location->id,
        ])->assertStatus(422);
        $this->assertSame('ready', $ready->fresh()->status->value);
    }

    public function test_bulk_recall_returns_common_assets_to_the_pool(): void
    {
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $a = Asset::factory()->create(['status' => 'common', 'owner' => 'Rack 1', 'owner_employee_id' => null]);
        $b = Asset::factory()->create(['status' => 'common', 'owner' => 'Rack 2', 'owner_employee_id' => null]);

        $this->postJson('/api/assets/bulk-recall', ['ids' => [$a->id, $b->id], 'warehouse' => 'Central IT'])
            ->assertOk()->assertJsonPath('updated', 2);
        $this->assertSame('ready', $a->fresh()->status->value);
    }

    public function test_bulk_recall_cancels_pending_acceptance_hand_overs(): void
    {
        // Cancel a batch of not-yet-accepted hand-overs — normal recall, only needs assets.transfer.
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.transfer', 'allowed' => true]);
        $this->actingAs($user);
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-PA1', 'first_name' => 'P', 'last_name' => 'A']);
        $a = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-PA1', 'owner_employee_id' => $employee->id]);

        $this->postJson('/api/assets/bulk-recall', ['ids' => [$a->id], 'warehouse' => 'Central IT'])
            ->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame('ready', $a->fresh()->status->value);
    }

    public function test_bulk_recall_of_employee_held_needs_force_permission(): void
    {
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-BR1', 'first_name' => 'H', 'last_name' => 'E']);

        // A transfer-only user cannot bulk-recall an employee-held asset.
        $u1 = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $u1->role_id, 'permission' => 'assets.transfer', 'allowed' => true]);
        $a = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-BR1', 'owner_employee_id' => $employee->id]);
        $this->actingAs($u1)->postJson('/api/assets/bulk-recall', ['ids' => [$a->id], 'warehouse' => 'Central IT'])->assertStatus(422);

        // assets.force_recall unlocks it.
        $u2 = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $u2->role_id, 'permission' => 'assets.force_recall', 'allowed' => true]);
        $b = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-BR1', 'owner_employee_id' => $employee->id]);
        $this->actingAs($u2)->postJson('/api/assets/bulk-recall', ['ids' => [$b->id], 'warehouse' => 'Central IT'])->assertOk();
        $this->assertSame('ready', $b->fresh()->status->value);
    }

    public function test_bulk_receive_returns_pending_return_assets(): void
    {
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-BRC', 'first_name' => 'P', 'last_name' => 'R']);
        $a = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-BRC', 'owner_employee_id' => $employee->id]);

        $this->postJson('/api/assets/bulk-receive', ['ids' => [$a->id], 'warehouse' => 'Central IT'])
            ->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame('ready', $a->fresh()->status->value);
    }

    public function test_bulk_receive_rejects_non_pending_return(): void
    {
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
        $this->postJson('/api/assets/bulk-receive', ['ids' => [$ready->id], 'warehouse' => 'Central IT'])->assertStatus(422);
    }

    public function test_written_off_asset_cannot_be_edited(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'writeoff']);

        $this->putJson("/api/assets/{$asset->id}", [
            'category_id' => $this->categoryId('laptop'),
            'model_id' => $this->modelId('X'),
            'source' => 'purchased',
            'value' => 1000,
            'vendor_id' => $this->vendorId(),
            'tag' => 'nope',
        ])->assertStatus(422);
    }

    public function test_cancel_writeoff_restores_asset_to_ready(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.cancel_writeoff', 'allowed' => true]);
        $this->actingAs($user);
        $asset = Asset::factory()->create(['status' => 'writeoff']);

        $this->postJson("/api/assets/{$asset->id}/cancel-writeoff")
            ->assertOk()
            ->assertJsonPath('data.status', 'ready');
        $this->assertSame('ready', $asset->fresh()->status->value);
    }

    public function test_cancel_writeoff_requires_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $asset = Asset::factory()->create(['status' => 'writeoff']);

        $this->postJson("/api/assets/{$asset->id}/cancel-writeoff")->assertForbidden();
        $this->assertSame('writeoff', $asset->fresh()->status->value);
    }

    /** Hard delete is gated by assets.delete — a bare user (or one with only assets.retire) is forbidden. */
    public function test_delete_requires_the_delete_permission(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.retire', 'allowed' => true]);
        $this->actingAs($user);
        $asset = Asset::factory()->create(['status' => 'ready', 'contract_id' => null]);

        $this->deleteJson("/api/assets/{$asset->id}")->assertForbidden();
        $this->assertDatabaseHas('assets', ['id' => $asset->id]);
    }

    /** With assets.delete a Ready, contract-free asset is permanently removed. */
    public function test_delete_removes_a_ready_asset_with_the_permission(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.delete', 'allowed' => true]);
        $this->actingAs($user);
        $asset = Asset::factory()->create(['status' => 'ready', 'source' => 'purchased', 'contract_id' => null]);

        $this->deleteJson("/api/assets/{$asset->id}")->assertOk();
        $this->assertDatabaseMissing('assets', ['id' => $asset->id]);
    }

    /** Only a Ready-to-deploy asset can be deleted — a deployed one is rejected (422) and kept. */
    public function test_delete_blocked_when_asset_is_not_ready(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['code' => 'EMP-DEL-1', 'first_name' => 'De', 'last_name' => 'Ployed']);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-DEL-1', 'owner_employee_id' => $employee->id, 'contract_id' => null]);

        $this->deleteJson("/api/assets/{$asset->id}")->assertStatus(422);
        $this->assertDatabaseHas('assets', ['id' => $asset->id]);
    }

    /** A contract-linked (rented) asset cannot be deleted even when Ready — it must be unlinked first. */
    public function test_delete_blocked_when_asset_is_linked_to_a_contract(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create([
            'vendor_id' => $this->vendorId('SVOA'), 'name' => 'Network lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 8500, 'billing_cycle' => 'monthly',
        ]);
        $asset = Asset::factory()->create(['status' => 'ready', 'source' => 'rented', 'contract_id' => $contract->id]);

        $this->deleteJson("/api/assets/{$asset->id}")->assertStatus(422);
        $this->assertDatabaseHas('assets', ['id' => $asset->id]);
    }
}
