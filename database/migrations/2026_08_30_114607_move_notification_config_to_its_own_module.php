<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Splits the single system.configure_notifications key into a notifications.* module.
 *
 * The Email & Notification page used to hang off one key, so anyone who could reword a
 * template could also switch it off, send test mail and read the delivery log. It now has a
 * master and seven rights beneath it, the way every other module does.
 *
 * Everyone who held the old key gets all of them: the split is about being ABLE to hand out
 * less, not about taking anything away on the way past. Narrowing a role is then a decision
 * somebody makes on the Permissions page, deliberately, rather than something a deploy does
 * to them overnight.
 */
return new class extends Migration
{
    /** The master plus every right that used to be implied by the old single key. */
    private const KEYS = [
        'notifications.module',
        'notifications.email_edit',
        'notifications.email_toggle',
        'notifications.email_test',
        'notifications.inapp_edit',
        'notifications.inapp_toggle',
        'notifications.inapp_test',
        'notifications.logs',
    ];

    public function up(): void
    {
        $holders = DB::table('role_permissions')
            ->where('permission', 'system.configure_notifications')
            ->where('allowed', true)
            ->pluck('role_id')
            ->all();

        // Every role gets a row per key, so revoking one later is a value change rather than
        // an insert — the same shape DatabaseSeeder establishes for every other permission.
        foreach (DB::table('roles')->pluck('id') as $roleId) {
            $allowed = in_array($roleId, $holders, true);
            foreach (self::KEYS as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => $allowed, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        }

        DB::table('role_permissions')->where('permission', 'system.configure_notifications')->delete();
    }

    public function down(): void
    {
        $holders = DB::table('role_permissions')
            ->where('permission', 'notifications.module')
            ->where('allowed', true)
            ->pluck('role_id')
            ->all();

        foreach ($holders as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission' => 'system.configure_notifications'],
                ['allowed' => true, 'updated_at' => now(), 'created_at' => now()],
            );
        }

        DB::table('role_permissions')->whereIn('permission', self::KEYS)->delete();
    }
};
