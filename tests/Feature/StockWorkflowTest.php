<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\StockBalance;
use App\Models\StockItem;
use App\Models\StockMovement;
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
        $roleId = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false])->id;
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $roleId, 'permission' => $p], ['allowed' => true]);
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

    public function test_direct_issue_movement_is_not_allowed(): void
    {
        // Issuing is request-only now; 'issue' is not a valid direct movement type.
        $item = $this->item(3);

        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'issue', 'stock_item_id' => $item->id, 'qty' => 2])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');

        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_transfer_is_neutral_moves_balance_and_blocks_when_source_insufficient(): void
    {
        $item = $this->item(0);

        // Seed the source warehouse via a receive (creates a balance at WH-HQ).
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'WH-HQ'])
            ->assertCreated();

        // Transfer 2 from WH-HQ โ’ WH-2: total on-hand is unchanged (neutral).
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 2, 'from_label' => 'WH-HQ', 'to_label' => 'WH-2'])
            ->assertCreated();
        $this->assertSame(3, $item->fresh()->current_stock);

        // Only 1 left at WH-HQ โ’ transferring 5 from there is rejected.
        $this->actingAs($this->superUser())
            ->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 5, 'from_label' => 'WH-HQ', 'to_label' => 'WH-2'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('qty');
    }

    public function test_movement_requires_type_specific_permission(): void
    {
        $item = $this->item();
        // Holds only stock.receive โ€” cannot transfer.
        $user = $this->userWith(['stock.view', 'stock.receive']);

        $this->actingAs($user)
            ->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1, 'from_label' => 'WH-A', 'to_label' => 'WH-B'])
            ->assertForbidden();

        $this->actingAs($user)
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 1])
            ->assertCreated();
    }

    public function test_request_workflow_submit_approve_fulfill(): void
    {
        $item = $this->item(0);
        $super = $this->superUser();

        // Seed 10 units at WH-HQ via the receive endpoint so a balance row exists.
        $this->actingAs($super)
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10])
            ->assertCreated();

        $requester = $this->userWith(['stock.view', 'stock.request']);

        $created = $this->actingAs($requester)
            ->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => 4, 'reason' => 'New hire setup'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->json('data');
        $reqId = $created['id'];
        $reqRef = $created['reference'];

        // Auto document number: REQ-<year>-<NNNN>.
        $this->assertSame('REQ-'.now()->year.'-0001', $reqRef);

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
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'issue', 'qty' => 4, 'reference' => $reqRef]);
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

    public function test_fulfill_deducts_from_chosen_source_warehouse(): void
    {
        $this->actingAs($this->superUser());
        $item = $this->item(0);
        // Receive 10 into WH-HQ and 5 into WH-2.
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'to_label' => 'WH-HQ'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-2'])->assertCreated();

        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->superUser()->id,
            'requester_name' => 'Tester', 'qty' => 4, 'reason' => 'x', 'status' => 'approved',
        ]);

        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['from_warehouse' => 'WH-2'])->assertOk();

        $this->assertSame(11, $item->fresh()->current_stock);
        $this->assertSame(1, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-2'])->value('qty'));
        $this->assertSame(10, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-HQ'])->value('qty'));
        $this->assertDatabaseHas('stock_movements', ['type' => 'issue', 'stock_item_id' => $item->id, 'from_label' => 'WH-2']);
    }

    public function test_fulfill_can_split_one_request_across_warehouses(): void
    {
        $this->actingAs($this->superUser());
        $item = $this->item(0);
        // Stock split: WH-1 has 3, WH-2 has 2 โ€” neither alone covers a qty-5 request.
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'WH-1'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'WH-2'])->assertCreated();

        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->superUser()->id,
            'requester_name' => 'Tester', 'qty' => 5, 'reason' => 'x', 'status' => 'approved',
        ]);

        $this->postJson("/api/stock-requests/{$req->id}/fulfill", [
            'allocations' => [
                ['warehouse' => 'WH-1', 'qty' => 3],
                ['warehouse' => 'WH-2', 'qty' => 2],
            ],
        ])->assertOk()->assertJsonPath('data.status', 'fulfilled');

        $this->assertSame(0, $item->fresh()->current_stock);
        $this->assertSame(0, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-1'])->value('qty'));
        $this->assertSame(0, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-2'])->value('qty'));
        // One issue movement per source warehouse.
        $this->assertSame(2, StockMovement::where(['stock_item_id' => $item->id, 'type' => 'issue'])->count());
    }

    public function test_fulfill_allocation_must_total_requested_qty(): void
    {
        $this->actingAs($this->superUser());
        $item = $this->item(0);
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'WH-1'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'WH-2'])->assertCreated();

        $req = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->superUser()->id,
            'requester_name' => 'Tester', 'qty' => 5, 'reason' => 'x', 'status' => 'approved',
        ]);

        // Allocations total 4, not 5 โ’ rejected, nothing deducted.
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", [
            'allocations' => [['warehouse' => 'WH-1', 'qty' => 3], ['warehouse' => 'WH-2', 'qty' => 1]],
        ])->assertStatus(422);

        $this->assertSame(5, $item->fresh()->current_stock);
        $this->assertSame('approved', $req->fresh()->status);
    }

    public function test_requester_only_sees_own_requests(): void
    {
        $item = $this->item();
        $a = $this->userWith(['stock.view', 'stock.view_request', 'stock.request']);
        $b = $this->userWith(['stock.view', 'stock.view_request', 'stock.request']);

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
