<?php

// Small controllers before their logic moves: in-use refusals, software delete, bell feed and workflow picker shapes.

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Settings\Vendor;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SmallControllersBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function stockItem(array $attributes): StockItem
    {
        static $n = 0;
        $n++;

        return StockItem::create([
            'sku' => "SKU-PIN-{$n}", 'name' => "Item {$n}", 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 5, ...$attributes,
        ]);
    }

    public function test_master_data_in_use_answers_409_with_the_summed_count_and_writes_no_audit(): void
    {
        $this->actingAs($this->super());

        $vendor = Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']);
        Asset::create(['asset_code' => 'A-1', 'vendor_id' => $vendor->id, 'status' => 'ready']);
        Contract::create(['vendor_id' => $vendor->id, 'name' => 'Lease', 'type' => 'hardware', 'start_date' => '2026-01-01',
            'end_date' => '2027-01-01', 'value' => 1, 'billing_cycle' => 'monthly']);

        $category = Category::create(['name' => 'Laptop']);
        Asset::create(['asset_code' => 'A-2', 'category_id' => $category->id, 'status' => 'ready']);
        $this->stockItem(['category_id' => $category->id]);

        $model = AssetModel::create(['name' => 'Latitude']);
        Asset::create(['asset_code' => 'A-3', 'model_id' => $model->id, 'status' => 'ready']);
        $this->stockItem(['model_id' => $model->id]);

        $unit = Unit::create(['name' => 'Box']);
        $this->stockItem(['unit_id' => $unit->id]);

        $warranty = WarrantyType::create(['name' => '1y']);
        $this->stockItem(['warranty_type_id' => $warranty->id]);

        $cases = [
            "/api/vendors/{$vendor->id}" => 2,
            "/api/categories/{$category->id}" => 2,
            "/api/asset-models/{$model->id}" => 2,
            "/api/units/{$unit->id}" => 1,
            "/api/warranty-types/{$warranty->id}" => 1,
        ];
        foreach ($cases as $url => $count) {
            $this->assertSame(['message' => 'in_use', 'count' => $count], $this->deleteJson($url)->assertStatus(409)->json(), $url);
        }
        $this->assertSame(0, AuditLog::where('action', 'like', 'Deleted %')->count());
    }

    public function test_master_data_not_in_use_is_deleted_with_its_audit_row(): void
    {
        $this->actingAs($this->super());
        $unit = Unit::create(['name' => 'Box']);

        $this->deleteJson("/api/units/{$unit->id}")->assertOk()->assertExactJson(['message' => 'success']);
        $this->assertModelMissing($unit);
        $this->assertSame(1, AuditLog::where('action', 'Deleted unit')->count());
    }

    public function test_software_with_active_members_is_refused_before_any_audit(): void
    {
        $this->actingAs($this->super());
        $software = Software::create(['name' => 'Office', 'license_type' => 'subscription', 'seats' => 5]);
        $employee = Employee::create(['code' => 'EMP-PIN1', 'first_name' => 'P', 'last_name' => 'One']);
        AccessMembership::create(['resource_type' => $software->getMorphClass(), 'resource_id' => $software->id, 'employee_id' => $employee->id, 'granted_at' => now()]);

        $this->deleteJson("/api/software/{$software->id}")->assertStatus(422)->assertExactJson(['message' => 'resource_has_members']);
        $this->assertSame(0, AuditLog::where('action', 'Deleted software')->count());
        $this->assertModelExists($software);
    }

    public function test_the_bell_feed_key_order(): void
    {
        $user = $this->super();
        $this->actingAs($user);
        $contract = Contract::create(['vendor' => 'Acme', 'name' => 'Plan', 'type' => 'service', 'start_date' => now()->subYear(),
            'end_date' => now()->addDays(30), 'value' => 1, 'billing_cycle' => 'yearly']);
        $user->notify(new ContractExpiryNotification($contract, 30));

        $this->assertSame(['data', 'unread', 'total', 'matching', 'has_more', 'counts'], array_keys($this->getJson('/api/notifications')->assertOk()->json()));
        $this->assertSame(
            ['data', 'unread', 'total', 'matching', 'has_more', 'counts', 'unread_since'],
            array_keys($this->getJson('/api/notifications?since='.urlencode(now()->subDay()->toIso8601String()))->assertOk()->json()),
        );
        $this->assertSame(['id', 'data', 'read', 'created_at', 'created_at_iso'], array_keys($this->getJson('/api/notifications')->json('data.0')));
    }

    public function test_the_workflow_pickers_row_keys(): void
    {
        $this->actingAs($this->super());
        Position::create(['title' => 'Manager', 'code' => 'POS-PIN']);
        $employee = Employee::create(['code' => 'EMP-PIN2', 'first_name' => 'W', 'last_name' => 'Two', 'status' => 'active']);
        User::factory()->create(['employee_id' => $employee->id]);

        $this->assertSame(['id', 'title'], array_keys($this->getJson('/api/workflows/position-options')->assertOk()->json('data.0')));
        $this->assertSame(
            ['id', 'code', 'name', 'name_th', 'position', 'department', 'department_th'],
            array_keys(collect($this->getJson('/api/workflows/employee-options')->assertOk()->json('data'))->firstWhere('id', $employee->id)),
        );
    }
}
