<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** The granular action keys that replace access.manage (excludes module/overview). */
    private const ACTION_KEYS = [
        'access.email_add', 'access.email_edit', 'access.email_delete',
        'access.file_add', 'access.file_edit', 'access.file_delete',
        'access.social_add', 'access.social_edit', 'access.social_delete',
        'access.software_add', 'access.software_edit', 'access.software_delete',
    ];

    /**
     * Access Directory moved from the view/manage pair to a master/tree model.
     * Map each role's old grants onto the new keys, preserving intent:
     *   access.view   → access.module + access.overview (see the module + Overview tab)
     *   access.manage → every registry add/edit/delete key (edit covers owner/member)
     * then drop the two legacy keys.
     */
    public function up(): void
    {
        $rows = DB::table('role_permissions')
            ->whereIn('permission', ['access.view', 'access.manage'])
            ->get()
            ->groupBy('role_id');

        foreach ($rows as $roleId => $perms) {
            $view = (bool) $perms->firstWhere('permission', 'access.view')?->allowed;
            $manage = (bool) $perms->firstWhere('permission', 'access.manage')?->allowed;

            $grants = [
                'access.module' => $view || $manage,
                'access.overview' => $view || $manage,
            ];
            foreach (self::ACTION_KEYS as $key) {
                $grants[$key] = $manage;
            }

            foreach ($grants as $permission => $allowed) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => $allowed, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        }

        DB::table('role_permissions')->whereIn('permission', ['access.view', 'access.manage'])->delete();
    }

    /** Collapse the granular keys back to the legacy pair (best effort). */
    public function down(): void
    {
        $rows = DB::table('role_permissions')
            ->where('permission', 'like', 'access.%')
            ->get()
            ->groupBy('role_id');

        foreach ($rows as $roleId => $perms) {
            $module = (bool) $perms->firstWhere('permission', 'access.module')?->allowed;
            $anyManage = $perms->whereIn('permission', self::ACTION_KEYS)->contains(fn ($p) => (bool) $p->allowed);

            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'access.view'],
                ['allowed' => $module, 'updated_at' => now(), 'created_at' => now()],
            );
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'access.manage'],
                ['allowed' => $anyManage, 'updated_at' => now(), 'created_at' => now()],
            );
        }

        DB::table('role_permissions')
            ->where('permission', 'like', 'access.%')
            ->whereNotIn('permission', ['access.view', 'access.manage'])
            ->delete();
    }
};
