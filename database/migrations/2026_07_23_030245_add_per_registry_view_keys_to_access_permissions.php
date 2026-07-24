<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const VIEW_KEYS = ['access.email_view', 'access.file_view', 'access.social_view', 'access.software_view'];

    /**
     * Adds the per-registry view layer under the Access master. Until now the
     * master alone implied seeing all four registries, so every role keeps its
     * current visibility: each view key is granted wherever access.module is.
     */
    public function up(): void
    {
        $modules = DB::table('role_permissions')->where('permission', 'access.module')->get();

        foreach ($modules as $row) {
            foreach (self::VIEW_KEYS as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $row->role_id, 'permission' => $key],
                    ['allowed' => (bool) $row->allowed, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        }
    }

    /** Drop the view layer again (the master resumes implying full visibility). */
    public function down(): void
    {
        DB::table('role_permissions')->whereIn('permission', self::VIEW_KEYS)->delete();
    }
};
