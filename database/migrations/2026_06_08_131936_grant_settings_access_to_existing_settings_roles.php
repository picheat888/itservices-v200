<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The Settings sidebar entry now gates on a single master key
     * (settings.access) instead of "any settings.* key". Grant that master to
     * every role that already holds at least one per-section settings key so no
     * role loses access to the Settings module on deploy. Super bypasses checks
     * (its permissions aren't stored), so it needs no row.
     */
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('allowed', true)
            ->where('permission', 'like', 'settings.%')
            ->where('permission', '!=', 'settings.access')
            ->distinct()
            ->pluck('role_id');

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'settings.access'],
                ['allowed' => true, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    /**
     * Remove the granted master rows (the gate reverts to the per-section keys).
     */
    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'settings.access')->delete();
    }
};
