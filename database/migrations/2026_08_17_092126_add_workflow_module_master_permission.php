<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `workflows.module` to every role that can already edit approval chains.
 *
 * The Workflows screen used to hang off a single key. It now has a master, the way every
 * other module does, and the master is what the sidebar entry and the read endpoints check
 * — so without this backfill the screen would disappear on the first deploy for everyone
 * who has it today, and the split would read as a feature being taken away.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', 'workflows.manage')
            ->where('allowed', true)
            ->pluck('role_id')
            ->all();

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'workflows.module'],
                ['allowed' => true, 'updated_at' => now(), 'created_at' => now()],
            );
        }
    }

    /** Roles keep `workflows.manage`, which is all they had before. */
    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'workflows.module')->delete();
    }
};
