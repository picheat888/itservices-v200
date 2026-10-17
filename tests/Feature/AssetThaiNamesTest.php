<?php

// Asset rows carry the Thai twins (owner_name_th, department_th, supplier_th) next to the English names.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Settings\Vendor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssetThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_asset_carries_holder_department_and_supplier_twins(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $dept = Department::create(['name' => 'Accounting', 'name_th' => 'บัญชี', 'tag' => 'ACC']);
        $holder = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'department_id' => $dept->id]);
        $vendor = Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']);
        $asset = Asset::factory()->create(['owner_employee_id' => $holder->id, 'vendor_id' => $vendor->id]);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()
            ->assertJsonPath('data.owner_name_th', 'สมชาย ใจดี')
            ->assertJsonPath('data.department_th', 'บัญชี')
            ->assertJsonPath('data.supplier_th', 'แอคมี');
    }

    public function test_twins_are_null_without_thai_names(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $dept = Department::create(['name' => 'Accounting', 'tag' => 'ACC']);
        $holder = Employee::create(['first_name' => 'Somchai', 'last_name' => 'J', 'department_id' => $dept->id]);
        $asset = Asset::factory()->create(['owner_employee_id' => $holder->id, 'vendor_id' => Vendor::create(['name' => 'Acme'])->id]);

        $data = $this->getJson("/api/assets/{$asset->id}")->assertOk()->json('data');

        foreach (['owner_name_th', 'department_th', 'supplier_th'] as $key) {
            $this->assertArrayHasKey($key, $data);
            $this->assertNull($data[$key]);
        }
    }

    public function test_contract_options_carry_vendor_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $vendor = Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']);
        Contract::create([
            'vendor_id' => $vendor->id, 'name' => 'Lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 1000, 'billing_cycle' => 'monthly',
        ]);

        $this->getJson('/api/assets/contract-options')->assertOk()->assertJsonPath('data.0.vendor_th', 'แอคมี');
    }
}
