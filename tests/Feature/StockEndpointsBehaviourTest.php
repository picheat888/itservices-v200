<?php

// Stock items, movements and requests: refusal order, the list meta, and the one-audit-row answers of a receive and a delete.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockEndpointsBehaviourTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Warehouse::firstOrCreate(['name' => 'WH-HQ']);
    }

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions): User
    {
        $user = User::factory()->create(['role' => 'user']);
        $roleId = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false])->id;
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $roleId, 'permission' => $p], ['allowed' => true]);
        }

        return $user;
    }

    private function item(int $current = 0): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-PIN-'.fake()->unique()->numerify('###'), 'name' => 'Pinned item', 'unit' => 'unit', 'cost' => 100,
            'current_stock' => $current, 'min_stock' => 2, 'max_stock' => 20, 'warehouse' => 'WH-HQ',
        ]);
    }

    public function test_a_bad_movement_from_a_user_without_the_type_right_is_422_not_403(): void
    {
        $this->actingAs($this->userWith(['stock.view']))
            ->postJson('/api/stock-movements', ['type' => 'receive'])
            ->assertUnprocessable()->assertJsonValidationErrors('stock_item_id');
    }

    public function test_a_valid_movement_without_the_type_right_is_403(): void
    {
        $item = $this->item();

        $this->actingAs($this->userWith(['stock.view']))
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1])
            ->assertForbidden();
    }

    public function test_a_receive_answers_201_with_the_movement(): void
    {
        $item = $this->item(5);

        $response = $this->actingAs($this->userWith(['stock.view', 'stock.receive']))
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2])
            ->assertCreated();

        $this->assertSame('receive', $response->json('data.type'));
        $this->assertSame(7, $item->fresh()->current_stock);
    }

    public function test_deleting_an_item_with_stock_is_refused_before_its_history_is_counted(): void
    {
        $item = $this->item(3);

        $this->actingAs($this->userWith(['stock.view', 'stock.delete']))
            ->deleteJson("/api/stock-items/{$item->id}")
            ->assertUnprocessable()->assertExactJson(['message' => 'item_has_stock']);
    }

    public function test_deleting_an_empty_item_writes_its_audit_row(): void
    {
        $item = $this->item(0);

        $this->actingAs($this->userWith(['stock.view', 'stock.delete']))
            ->deleteJson("/api/stock-items/{$item->id}")->assertOk()->assertExactJson(['message' => 'success']);

        $this->assertSame('Deleted stock item', AuditLog::query()->latest('id')->value('action'));
    }

    public function test_the_request_list_counts_ignore_the_status_filter(): void
    {
        $item = $this->item(10);
        foreach (['pending', 'pending', 'approved', 'fulfilled'] as $status) {
            StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'X', 'qty' => 1, 'reason' => 'r', 'status' => $status]);
        }

        $meta = $this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/stock-requests?status=fulfilled')->assertOk()->json('meta');

        $this->assertSame(['total', 'per_page', 'current_page', 'last_page', 'pending', 'outstanding'], array_keys($meta));
        $this->assertSame([1, 2, 3], [$meta['total'], $meta['pending'], $meta['outstanding']]);
    }

    public function test_fulfilling_a_pending_request_is_refused_on_its_status_before_its_fields(): void
    {
        $item = $this->item(10);
        $request = StockRequest::create(['stock_item_id' => $item->id, 'requester_name' => 'X', 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);

        $response = $this->actingAs($this->userWith(['stock.view', 'stock.fulfill']))
            ->postJson("/api/stock-requests/{$request->id}/fulfill", ['serial_ids' => 'not-an-array'])
            ->assertUnprocessable();

        $this->assertArrayNotHasKey('serial_ids', (array) $response->json('errors'));
    }

    public function test_nobody_decides_their_own_requisition(): void
    {
        $approver = $this->userWith(['stock.view', 'stock.approve']);
        $item = $this->item(10);
        $own = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $approver->id, 'requester_name' => 'Me', 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);

        $this->actingAs($approver)->postJson("/api/stock-requests/{$own->id}/approve")
            ->assertForbidden()->assertJsonPath('message', 'You cannot decide your own requisition.');
    }
}
