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
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    /** Create a category (Master Data) and return its id — asset POSTs now send category_id. */
    private function categoryId(string $name = 'Laptop'): int
    {
        return Category::create(['name' => $name])->id;
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
            ->assertJsonPath('data.initial_owner', 'EMP-1042');

        $this->getJson('/api/assets')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_tag_is_auto_generated_when_blank(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('X'), 'value' => 100,
        ])->assertCreated()
            ->assertJsonPath('data.tag', fn ($tag) => is_string($tag) && str_starts_with($tag, 'INK-IT-'));
    }

    public function test_rented_asset_derives_value_and_dates_from_contract(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'vendor' => 'SVOA', 'name' => 'Network lease', 'type' => 'hardware',
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
            ->assertJsonPath('data.tag', fn ($tag) => str_starts_with($tag, 'INK-IT-'));
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
            'category_id' => $this->categoryId('printer'), 'source' => 'purchased', 'model_id' => $this->modelId('Brother HL'), 'value' => 5000,
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
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('MacBook Pro'), 'value' => 32100,
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

    public function test_user_without_permission_cannot_register(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->postJson('/api/assets', [
            'type' => 'laptop', 'source' => 'purchased', 'model' => 'X', 'value' => 1,
        ])->assertForbidden();
    }

    public function test_transfer_moves_asset_to_pending_acceptance(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT']);
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'location_id' => $location->id, 'reason' => 'New hire'])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_acceptance')
            ->assertJsonPath('data.owner', 'EMP-2000')
            ->assertJsonPath('data.location', 'HQ Floor 3')
            ->assertJsonPath('data.location_id', $location->id);
    }

    public function test_transfer_requires_a_location(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'warehouse' => 'Central IT']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000'])
            ->assertStatus(422)->assertJsonValidationErrors('location_id');
    }

    public function test_my_assets_returns_only_the_users_own_assets(): void
    {
        $employee = Employee::create(['code' => 'EMP-7001', 'first_name' => 'Me', 'last_name' => 'User']);
        $user = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.my', 'allowed' => true]);
        Asset::factory()->create(['owner' => 'EMP-7001']);
        Asset::factory()->create(['owner' => 'EMP-7001']);
        Asset::factory()->create(['owner' => 'EMP-9999']);

        $this->actingAs($user);
        $this->getJson('/api/assets/mine')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_only_the_recipient_employee_can_accept_a_handover(): void
    {
        $employee = Employee::create(['code' => 'EMP-9001', 'first_name' => 'Rec', 'last_name' => 'Ipient']);
        $recipient = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        $asset = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-9001']);

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
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'warehouse' => 'Central IT']);
        $location = Location::create(['name' => 'HQ']);

        $this->actingAs($this->super());
        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-8001', 'location_id' => $location->id])->assertOk();

        $this->assertSame(1, $recipient->fresh()->notifications()->count());
        $this->assertSame('asset_assigned', $recipient->notifications()->first()->data['type']);
    }

    public function test_cannot_transfer_a_deployed_asset(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1042']);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'location_id' => $location->id])
            ->assertStatus(422);
    }

    public function test_holder_can_request_return_of_their_asset(): void
    {
        $employee = Employee::create(['code' => 'EMP-6001', 'first_name' => 'Hold', 'last_name' => 'Er']);
        $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6001']);

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

    public function test_return_request_notifies_it_receivers(): void
    {
        $it = $this->super(); // super holds assets.transfer → an IT receiver
        $employee = Employee::create(['code' => 'EMP-6100', 'first_name' => 'H', 'last_name' => 'R']);
        $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6100']);

        $this->actingAs($holder);
        $this->postJson("/api/assets/{$asset->id}/request-return")->assertOk();

        $this->assertSame(1, $it->fresh()->notifications()->count());
        $this->assertSame('asset_return_requested', $it->notifications()->first()->data['type']);
    }

    public function test_mark_received_returns_asset_to_pool(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500']);

        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', null)
            ->assertJsonPath('data.owned_since', null);
    }

    public function test_mark_received_stores_asset_in_chosen_warehouse(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500', 'warehouse' => 'Branch A']);

        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', null)
            ->assertJsonPath('data.warehouse', 'Central IT');
    }

    public function test_mark_received_requires_a_destination_warehouse(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'warehouse' => 'Branch A']);

        $this->postJson("/api/assets/{$asset->id}/receive")
            ->assertStatus(422)->assertJsonValidationErrors('warehouse');
    }

    public function test_asset_can_be_created_and_filtered_by_warehouse(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'category_id' => $this->categoryId('laptop'), 'source' => 'purchased', 'model_id' => $this->modelId('Dell 5440'), 'value' => 100, 'warehouse' => 'Central IT',
        ])->assertCreated()->assertJsonPath('data.warehouse', 'Central IT');

        Asset::factory()->create(['warehouse' => 'Branch A']);

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
        $a = Asset::factory()->create(['status' => 'ready']);
        $b = Asset::factory()->create(['status' => 'ready']);

        $this->postJson('/api/assets/bulk', ['ids' => [$a->id, $b->id], 'op' => 'writeoff', 'reason' => 'EOL'])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame('writeoff', $a->fresh()->status->value);
    }

    public function test_transfer_is_recorded_in_the_transfer_log(): void
    {
        $this->actingAs($this->super());
        // Pooled asset (no owner) stored in a warehouse.
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'warehouse' => 'Central IT']);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'location_id' => $location->id, 'reason' => 'New hire'])->assertOk();

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
            'asset_tag' => $asset->tag,
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
}
