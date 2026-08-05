<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Request data left Master data to become its own Settings section, so it gets
 * its own key: settings.requestdata.
 *
 * Every role that could reach the screen where it used to live (settings.masterdata)
 * keeps that reach — nobody loses a screen because it moved.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', 'settings.masterdata')->where('allowed', true)
            ->pluck('role_id');

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'settings.requestdata'],
                ['allowed' => true, 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'settings.requestdata')->delete();
    }
};
