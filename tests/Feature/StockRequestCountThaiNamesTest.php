<?php

// Requests keep approver and fulfiller ids; requests and counts carry Thai names that fall back to English.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Settings\Category;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockRequestCountThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    private function staff(?string $nameTh): User
    {
        $employee = Employee::create(['first_name' => 'Somchai', 'first_name_th' => $nameTh, 'status' => 'active']);

        return User::factory()->create(['role' => 'super', 'name' => 'Somchai Admin', 'employee_id' => $employee->id]);
    }

    /** @return array{0: int, 1: User} request id and the acting super user, after approve and fulfil */
    private function fulfilledRequest(?string $nameTh): array
    {
        $super = $this->staff($nameTh);
        $item = StockItem::create(['sku' => 'SKU-1', 'name' => 'Toner', 'unit' => 'pcs', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 50, 'warehouse' => 'WH-HQ']);
        Warehouse::firstOrCreate(['name' => 'WH-HQ']);
        $this->actingAs($super)->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10])->assertCreated();
        $asker = User::factory()->create(['role' => 'super']);

        $id = $this->actingAs($asker)->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => 2, 'reason' => 'Spare'])->json('data.id');
        $this->actingAs($super)->postJson("/api/stock-requests/{$id}/approve")->assertOk();
        $this->actingAs($super)->postJson("/api/stock-requests/{$id}/fulfill")->assertOk();

        return [$id, $super];
    }

    public function test_approve_and_fulfil_store_the_user_ids(): void
    {
        [$id, $super] = $this->fulfilledRequest('สมชาย');

        $row = StockRequest::findOrFail($id);
        $this->assertSame($super->id, $row->approver_id);
        $this->assertSame($super->id, $row->fulfilled_by_id);
    }

    public function test_request_list_returns_thai_names_of_approver_and_fulfiller(): void
    {
        [$id, $super] = $this->fulfilledRequest('สมชาย');

        $row = collect($this->actingAs($super)->getJson('/api/stock-requests')->assertOk()->json('data'))->firstWhere('id', $id);
        $this->assertSame('สมชาย', $row['approver_name_th']);
        $this->assertSame('สมชาย', $row['fulfilled_by_th']);
    }

    public function test_request_thai_names_fall_back_to_the_english_name(): void
    {
        [$id, $super] = $this->fulfilledRequest(null);

        $row = collect($this->actingAs($super)->getJson('/api/stock-requests')->assertOk()->json('data'))->firstWhere('id', $id);
        $this->assertSame('Somchai Admin', $row['approver_name_th']);
        $this->assertSame('Somchai Admin', $row['fulfilled_by_th']);
    }

    public function test_count_returns_thai_category_and_people_names(): void
    {
        Category::create(['name' => 'Consumable', 'name_th' => 'วัสดุสิ้นเปลือง']);
        $user = $this->staff('สมชาย');
        $count = StockCount::create(['warehouse' => 'Main', 'category' => 'Consumable', 'status' => 'draft', 'counted_by' => $user->id, 'committed_by' => $user->id]);

        $data = $this->actingAs($user)->getJson("/api/stock-counts/{$count->id}")->assertOk()->json('data');
        $this->assertSame('วัสดุสิ้นเปลือง', $data['category_th']);
        $this->assertSame('สมชาย', $data['counted_by_th']);
        $this->assertSame('สมชาย', $data['committed_by_th']);
    }

    public function test_count_thai_names_fall_back_to_english(): void
    {
        Category::create(['name' => 'Consumable']);
        $user = $this->staff(null);
        $count = StockCount::create(['warehouse' => 'Main', 'category' => 'Consumable', 'status' => 'draft', 'counted_by' => $user->id, 'committed_by' => $user->id]);

        $data = $this->actingAs($user)->getJson("/api/stock-counts/{$count->id}")->assertOk()->json('data');
        $this->assertSame('Consumable', $data['category_th']);
        $this->assertSame('Somchai Admin', $data['counted_by_th']);
        $this->assertSame('Somchai Admin', $data['committed_by_th']);
    }
}
