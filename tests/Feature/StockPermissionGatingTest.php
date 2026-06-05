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
