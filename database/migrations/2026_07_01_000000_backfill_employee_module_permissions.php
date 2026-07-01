<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Grant the new employee master + dashboard/org view keys to every role that
     * currently holds employees.view, so existing roles keep their Employees sidebar
     * entry and Dashboard/Org tabs once the tree-gating goes live.
     */
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', 'employees.view')
            ->where('allowed', true)
            ->pluck('role_id')
            ->unique();

        $keys = ['employees.module', 'employees.view_dashboard', 'employees.view_org'];

        foreach ($roleIds as $roleId) {
            foreach ($keys as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => true],
                );
            }
        }
    }

    /**
     * Down: remove only the backfilled master/dashboard/org grants. Left intentionally
     * conservative — it does not touch management children.
     */
    public function down(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', ['employees.module', 'employees.view_dashboard', 'employees.view_org'])
            ->delete();
    }
};
