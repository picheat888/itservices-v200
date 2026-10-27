<?php

// One stock movement or one stock request by id, behind the same gates as their lists.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockShowEndpointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'gate_'.uniqid(), 'name' => 'Gate Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function item(): StockItem
    {
        return StockItem::create(['sku' => 'T-'.uniqid(), 'name' => 'Test Item']);
    }

    private function movement(): StockMovement
    {
        return StockMovement::create([
            'doc_no' => 'RCV-TEST-'.uniqid(),
            'type' => 'receive',
            'stock_item_id' => $this->item()->id,
            'qty' => 1,
            'moved_at' => now(),
        ]);
    }

    private function request(User $by): StockRequest
    {
        return StockRequest::create([
            'reference' => 'SR-TEST-'.uniqid(),
            'stock_item_id' => $this->item()->id,
            'user_id' => $by->id,
            'requester_name' => $by->name,
            'qty' => 1,
            'reason' => 'test',
            'status' => 'pending',
        ]);
    }

    public function test_movement_show_returns_resource_for_viewer(): void
    {
        $movement = $this->movement();

        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events']))
            ->getJson("/api/stock-movements/{$movement->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $movement->id);
    }

    public function test_movement_show_forbidden_without_view_events(): void
    {
        $movement = $this->movement();

        $this->actingAs($this->userWith(['stock.module', 'stock.view']))
            ->getJson("/api/stock-movements/{$movement->id}")
            ->assertForbidden();
    }

    public function test_request_show_returns_own_request(): void
    {
        $user = $this->userWith(['stock.module', 'stock.view_request']);
        $request = $this->request($user);

        $this->actingAs($user)
            ->getJson("/api/stock-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $request->id);
    }

    public function test_request_show_hides_other_users_request_from_plain_requester(): void
    {
        $request = $this->request(User::factory()->create());

        $this->actingAs($this->userWith(['stock.module', 'stock.view_request']))
            ->getJson("/api/stock-requests/{$request->id}")
            ->assertNotFound();
    }

    public function test_request_show_visible_to_approver(): void
    {
        $request = $this->request(User::factory()->create());

        $this->actingAs($this->userWith(['stock.module', 'stock.view_request', 'stock.approve']))
            ->getJson("/api/stock-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $request->id);
    }

    public function test_request_show_forbidden_without_view_request(): void
    {
        $user = $this->userWith(['stock.module', 'stock.view']);
        $request = $this->request($user);

        $this->actingAs($user)
            ->getJson("/api/stock-requests/{$request->id}")
            ->assertForbidden();
    }
}
