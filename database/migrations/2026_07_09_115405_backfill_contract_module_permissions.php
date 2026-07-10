<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The Contracts module moved to a master/tree permission model (mirroring Stock
 * and Employees): a new master `contracts.module` gates the module + sidebar, and
 * the lifecycle actions sit under a `contracts.view_lifecycle` group. This backfills
 * existing role grants so nothing is lost on deploy:
 *   - roles holding `contracts.view` gain `contracts.module` + `contracts.view_dashboard`
 *   - roles holding `contracts.cancel`/`contracts.expire` gain `contracts.view_lifecycle`
 *   - the removed `contracts.renew` permission rows are dropped.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        // Roles that hold the old de-facto master (contracts.view) keep module + dashboard.
        $viewRoleIds = DB::table('role_permissions')
            ->where('permission', 'contracts.view')->where('allowed', true)
            ->pluck('role_id')->all();

        // Roles that manage the lifecycle need the new group parent so the children survive normalization.
        $lifecycleRoleIds = DB::table('role_permissions')
            ->whereIn('permission', ['contracts.cancel', 'contracts.expire'])->where('allowed', true)
            ->pluck('role_id')->unique()->all();

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

        $grant($viewRoleIds, 'contracts.module');
        $grant($viewRoleIds, 'contracts.view_dashboard');
        $grant($lifecycleRoleIds, 'contracts.view_lifecycle');

        // The Renew feature is gone — drop its permission rows.
        DB::table('role_permissions')->where('permission', 'contracts.renew')->delete();
    }

    public function down(): void
    {
        // Drop the structural keys introduced by this migration. `contracts.renew`
        // cannot be restored (the feature no longer exists).
        DB::table('role_permissions')
            ->whereIn('permission', ['contracts.module', 'contracts.view_dashboard', 'contracts.view_lifecycle'])
            ->delete();
    }
};
