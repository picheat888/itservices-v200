<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockTreeMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_role_with_old_view_gains_module_and_per_tab_views(): void
    {
        $role = Role::create(['key' => 'legacy_stock', 'name' => 'Legacy Stock', 'is_system' => false]);
        RolePermission::insert([
            ['role_id' => $role->id, 'permission' => 'stock.view', 'allowed' => true],
            ['role_id' => $role->id, 'permission' => 'stock.receive', 'allowed' => true],
        ]);

        // Run the backfill migration's up() directly.
        $migration = require base_path('database/migrations/2026_06_05_120000_grant_stock_tree_permissions.php');
        $migration->up();

        $granted = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        foreach (['stock.module', 'stock.view', 'stock.view_dashboard', 'stock.view_request', 'stock.view_events', 'stock.receive'] as $k) {
            $this->assertContains($k, $granted, "expected {$k}");
        }
        $this->assertNotContains('stock.view_count', $granted); // no legacy audit grant
    }
}
