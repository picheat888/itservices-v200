<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifies that the permission-save endpoint normalises the stock hierarchy
 * before persisting: children without their required parent view key are
 * silently dropped rather than stored.
 */
class StockPermissionGatingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // The 'super' role must exist so isSuper() resolves correctly.
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /**
     * Returns a super-admin user who bypasses all permission checks.
     */
    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'gate_'.uniqid(), 'name' => 'Gate Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /**
     * The dashboard summary endpoint must be gated by stock.view_dashboard,
     * not the generic stock.view — a user who can see stock items but has no
     * view_dashboard permission must receive 403.
     */
    public function test_summary_requires_view_dashboard(): void
    {
        $blocked = $this->userWith(['stock.module', 'stock.view']);          // items view, no dashboard
        $allowed = $this->userWith(['stock.module', 'stock.view_dashboard']);

        $this->actingAs($blocked)->getJson('/api/stock-items/summary')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/stock-items/summary')->assertOk();
    }

    /**
     * The request-list endpoint must be gated by stock.view_request, not the
     * generic stock.view — a user who can view items but has no view_request
     * permission must receive 403.
     */
    public function test_request_list_requires_view_request(): void
    {
        $blocked = $this->userWith(['stock.module', 'stock.view']);
        $allowed = $this->userWith(['stock.module', 'stock.view_request']);

        $this->actingAs($blocked)->getJson('/api/stock-requests')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/stock-requests')->assertOk();
    }

    /**
     * Saving a set that includes stock.fulfill (child of stock.view_request) but
     * omits stock.view_request must persist stock.receive (whose parent stock.view
     * IS present) while dropping stock.fulfill.
     */
    public function test_save_normalizes_away_orphan_children(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'norm_test', 'name' => 'Norm Test', 'is_system' => false]);

        // module + stock.view present → stock.receive is valid
        // stock.view_request absent → stock.fulfill is an orphan and must be dropped
        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['stock.module', 'stock.view', 'stock.receive', 'stock.fulfill'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)
            ->where('allowed', true)
            ->pluck('permission')
            ->all();

        $this->assertContains('stock.receive', $stored);
        $this->assertNotContains('stock.fulfill', $stored); // dropped: no view_request parent
    }
}
