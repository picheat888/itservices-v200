<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The Assets module moved to a master/tree permission model (mirroring Contracts,
 * Stock and Employees): a new master `assets.module` gates the module + sidebar,
 * and the operational actions now sit under group parents (`assets.view` for the
 * inventory CRUD, `assets.manage` for transfer/receive/write-off, `assets.special`
 * for force-recall/cancel-write-off). "My Assets" gains a `assets.return` child.
 *
 * This backfills existing role grants so nothing is lost once normalization applies:
 *   - roles holding any real asset capability gain `assets.module`
 *   - roles holding `assets.view` also gain `assets.view_dashboard`
 *   - roles holding register/edit/delete gain `assets.view`
 *   - roles holding transfer/receive/retire gain `assets.manage`
 *   - roles holding force_recall/cancel_writeoff gain `assets.special`
 *   - roles holding `assets.my` gain `assets.return`
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        // Role ids that hold any of the given child permissions (imply a new parent).
        $roleIdsWith = fn (array $permissions): array => DB::table('role_permissions')
            ->whereIn('permission', $permissions)->where('allowed', true)
            ->pluck('role_id')->unique()->all();

        // Any real asset capability implies module (sidebar/master) access.
        $moduleRoleIds = $roleIdsWith([
            'assets.view', 'assets.view_dashboard', 'assets.register', 'assets.edit', 'assets.delete',
            'assets.transfer', 'assets.receive', 'assets.retire', 'assets.force_recall', 'assets.cancel_writeoff',
        ]);
        $viewRoleIds = $roleIdsWith(['assets.view']);
        $inventoryRoleIds = $roleIdsWith(['assets.register', 'assets.edit', 'assets.delete']);
        $manageRoleIds = $roleIdsWith(['assets.transfer', 'assets.receive', 'assets.retire']);
        $specialRoleIds = $roleIdsWith(['assets.force_recall', 'assets.cancel_writeoff']);
        $myRoleIds = $roleIdsWith(['assets.my']);

        $grant = function (array $roleIds, string $permission) use ($now): void {
            foreach ($roleIds as $roleId) {
                $existing = DB::table('role_permissions')
                    ->where('role_id', $roleId)->where('permission', $permission);
                if ($existing->exists()) {
                    $existing->update(['allowed' => true, 'updated_at' => $now]);
                } else {
                    DB::table('role_permissions')->insert([
                        'role_id' => $roleId, 'permission' => $permission,
                        'allowed' => true, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
            }
        };

        $grant($moduleRoleIds, 'assets.module');
        $grant($viewRoleIds, 'assets.view_dashboard');
        $grant($inventoryRoleIds, 'assets.view');
        $grant($manageRoleIds, 'assets.manage');
        $grant($specialRoleIds, 'assets.special');
        $grant($myRoleIds, 'assets.return');
    }

    public function down(): void
    {
        // Drop the structural keys introduced by this migration.
        DB::table('role_permissions')
            ->whereIn('permission', ['assets.module', 'assets.view_dashboard', 'assets.manage', 'assets.special', 'assets.return'])
            ->delete();
    }
};
