<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\StockItem;
use App\Models\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function superUser(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** A user role granted only the given stock.* permissions. */
    private function userWith(array $permissions): User
    {
        $user = User::factory()->create(['role' => 'user']);
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role' => 'user', 'permission' => $p], ['allowed' => true]);
        }

        return $user;
    }

    private function item(int $current = 10): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-WF-'.fake()->unique()->numerify('###'),
            'name' => 'Workflow item',
            'unit' => 'unit',
            'cost' => 100,
            'current_stock' => $current,
            'min_stock' => 2,
            'max_stock' => 20,
            'warehouse' => 'WH-HQ',
        ]);
    }

    public function test_receive_increases_stock(): void
    {
        $item = $this->item(5);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 7])
            ->assertCreated()
            ->assertJsonPath('data.type', 'receive');

        $this->assertSame(12, $item->fresh()->current_stock);
    }

    public function test_issue_decreases_stock_and_blocks_when_insufficient(): void
    {
        $item = $this->item(3);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'issue', 'stock_item_id' => $item->id, 'qty' => 2])
            ->assertCreated();
        $this->assertSame(1, $item->fresh()->current_stock);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'issue', 'stock_item_id' => $item->id, 'qty' => 5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('qty');
    }

    public function test_movement_requires_type_specific_permission(): void
    {
        $item = $this->item();
        // Holds only stock.receive — cannot issue.
        $user = $this->userWith(['stock.view', 'stock.receive']);

        $this->actingAs($user)
            ->postJson('/api/stock-movements', ['type' => 'issue', 'stock_item_id' => $item->id, 'qty' => 1])
            ->assertForbidden();

        $this->actingAs($user)
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1])
            ->assertCreated();
    }

    public function test_request_workflow_submit_approve_fulfill(): void
    {
        $item = $this->item(10);
        $requester = $this->userWith(['stock.view', 'stock.request']);

        $reqId = $this->actingAs($requester)
            ->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => 4, 'reason' => 'New hire setup'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->json('data.id');

        $super = $this->superUser();

        $this->actingAs($super)
            ->postJson("/api/stock-requests/{$reqId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->actingAs($super)
            ->postJson("/api/stock-requests/{$reqId}/fulfill")
            ->assertOk()
            ->assertJsonPath('data.status', 'fulfilled');

        // Fulfillment issued 4 units and created an issue movement.
        $this->assertSame(6, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'issue', 'qty' => 4, 'reference' => "REQ-{$reqId}"]);
    }

    public function test_cannot_fulfill_request_that_is_not_approved(): void
    {
        $item = $this->item();
        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'X', 'qty' => 1, 'reason' => 'r', 'status' => 'pending',
        ]);

        $this->actingAs($this->superUser())
            ->postJson("/api/stock-requests/{$req->id}/fulfill")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    public function test_requester_only_sees_own_requests(): void
    {
        $item = $this->item();
        $a = $this->userWith(['stock.view', 'stock.request']);
        $b = $this->userWith(['stock.view', 'stock.request']);

        StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $a->id, 'requester_name' => 'A', 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);
        StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $b->id, 'requester_name' => 'B', 'qty' => 1, 'reason' => 'r', 'status' => 'pending']);

        $this->actingAs($a)
            ->getJson('/api/stock-requests')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        // Super sees all.
        $this->actingAs($this->superUser())
            ->getJson('/api/stock-requests')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }
}
