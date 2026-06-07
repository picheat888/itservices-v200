<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Consolidates the two settings permissions `settings.branding` and
 * `settings.display` into a single `settings.system` key. Any role that held
 * either of the old keys gets `settings.system` (granted if either was allowed),
 * then the legacy rows are removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $legacy = ['settings.branding', 'settings.display'];

        $rows = DB::table('role_permissions')->whereIn('permission', $legacy)->get();

        foreach ($rows->groupBy('role_id') as $roleId => $group) {
            $allowed = $group->contains(fn ($r) => (bool) $r->allowed);

            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'settings.system'],
                ['allowed' => $allowed]
            );
        }

        DB::table('role_permissions')->whereIn('permission', $legacy)->delete();
    }

    public function down(): void
    {
        // Re-split `settings.system` back into the two legacy keys (mirrors the value).
        $rows = DB::table('role_permissions')->where('permission', 'settings.system')->get();

        foreach ($rows as $row) {
            foreach (['settings.branding', 'settings.display'] as $permission) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $row->role_id, 'permission' => $permission],
                    ['allowed' => $row->allowed]
                );
            }
        }

        DB::table('role_permissions')->where('permission', 'settings.system')->delete();
    }
};
