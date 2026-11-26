<?php

// A rented asset may be registered without a contract; a linked rental keeps its contract on edit.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

class AssetRentalWithoutContractTest extends TestCase
{
    use GrantsReports, RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rw_'.uniqid(), 'name' => 'Rental Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return array<string, mixed> */
    private function rentedPayload(array $extra = []): array
    {
        return array_merge([
            'category_id' => Category::firstOrCreate(['name' => 'Laptop'])->id,
            'model_id' => AssetModel::create(['name' => 'Rental Model'])->id,
            'source' => 'rented',
        ], $extra);
    }

    public function test_a_rented_asset_registers_without_a_contract(): void
    {
        $this->actingAs($this->userWith(['assets.register']));

        $this->postJson('/api/assets', $this->rentedPayload())
            ->assertCreated()
            ->assertJsonPath('data.contract_id', null)
            ->assertJsonPath('data.status', 'ready');
    }

    public function test_an_unlinked_rental_can_be_edited_and_stay_unlinked(): void
    {
        $this->actingAs($this->userWith(['assets.edit']));
        $asset = Asset::factory()->rented()->create(['status' => 'ready']);
        $asset->update(['contract_id' => null]);

        $this->putJson("/api/assets/{$asset->id}", $this->rentedPayload(['model_id' => $asset->model_id, 'category_id' => $asset->category_id, 'contract_id' => null]))
            ->assertOk();
        $this->assertNull($asset->fresh()->contract_id);
    }

    public function test_a_linked_rental_cannot_drop_its_contract_on_edit(): void
    {
        $this->actingAs($this->userWith(['assets.edit']));
        $asset = Asset::factory()->rented()->create(['status' => 'ready']);
        $contractId = $asset->contract_id;

        $this->putJson("/api/assets/{$asset->id}", $this->rentedPayload(['model_id' => $asset->model_id, 'category_id' => $asset->category_id, 'contract_id' => null]))
            ->assertStatus(422)
            ->assertJsonPath('errors.contract_id.0', 'contract_keep');
        $this->assertSame($contractId, $asset->fresh()->contract_id);
    }

    public function test_a_linked_rental_can_switch_to_another_open_contract(): void
    {
        $this->actingAs($this->userWith(['assets.edit']));
        $asset = Asset::factory()->rented()->create(['status' => 'ready']);
        $other = Contract::create([
            'vendor_id' => Vendor::firstOrCreate(['name' => 'Lease Vendor'])->id, 'name' => 'Other lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2028-01-01', 'value' => 5000, 'billing_cycle' => 'monthly',
        ]);

        $this->putJson("/api/assets/{$asset->id}", $this->rentedPayload(['model_id' => $asset->model_id, 'category_id' => $asset->category_id, 'contract_id' => $other->id]))
            ->assertOk();
        $this->assertSame($other->id, $asset->fresh()->contract_id);
    }

    public function test_an_unlinked_rental_reads_fine_in_the_api_and_the_asset_reports(): void
    {
        $asset = Asset::factory()->rented()->create(['status' => 'ready']);
        $asset->update(['contract_id' => null]);
        $written = Asset::factory()->rented()->create(['status' => 'writeoff', 'written_off_at' => now()->subDay()]);
        $written->update(['contract_id' => null]);

        $this->actingAs($this->userWith(['assets.view', ...$this->reportRights('assets')]));

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.contract_code', null)
            ->assertJsonPath('data.lease_end', null);
        $this->getJson('/api/reports/tabular/assets.overview/rows')->assertOk();
        $this->getJson('/api/reports/tabular/assets.writeoffs/rows?from='.now()->subMonth()->toDateString().'&to='.now()->toDateString())
            ->assertOk();
    }
}
