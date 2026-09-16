<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `access.my` to every role that already holds `assets.my`.
 *
 * The self-service page now shows two halves — the kit somebody holds and the systems they
 * can reach — and each half answers to its own key. Without this backfill the page would
 * ship with its lower half blank for everybody, which reads as "you have no access to
 * anything" rather than "nobody has been granted the right to look yet".
 *
 * Matched on `assets.my` because that is the same audience: whoever is trusted to see their
 * own equipment is trusted to see their own accounts.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', 'assets.my')
            ->where('allowed', true)
            ->pluck('role_id')
            ->all();

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'access.my'],
                ['allowed' => true, 'updated_at' => now(), 'created_at' => now()],
            );
        }
    }

    /** Roles keep everything they had before; only the new key goes. */
    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'access.my')->delete();
    }
};
