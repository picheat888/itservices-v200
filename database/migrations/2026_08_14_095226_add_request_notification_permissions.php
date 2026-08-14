<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Grants the two new "who hears about it" request permissions to the roles that already
 * do the hearing today.
 *
 * `requests.notify_approved` replaces `requests.fulfill` as the recipient gate for the
 * "approved, ready to fulfil" bell and mail. Without this backfill that notification would
 * go silent on the first deploy — nobody would hold the new key, and the change would read
 * as a bug rather than a setting. `requests.notify_stalled` (the weekly digest of approvals
 * left sitting) starts with the same audience for the same reason: opting people out is a
 * decision for the Permissions screen, not a side effect of a migration.
 */
return new class extends Migration
{
    /** Roles that hold this permission today, whatever anyone has configured since seeding. */
    private function roleIdsWith(string $permission): array
    {
        return DB::table('role_permissions')
            ->where('permission', $permission)
            ->where('allowed', true)
            ->pluck('role_id')
            ->all();
    }

    public function up(): void
    {
        $roleIds = $this->roleIdsWith('requests.fulfill');

        foreach ($roleIds as $roleId) {
            foreach (['requests.notify_approved', 'requests.notify_stalled'] as $permission) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        }
    }

    /**
     * Removes the rows this migration is responsible for. Roles keep `requests.fulfill`,
     * which is what they had before.
     */
    public function down(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', ['requests.notify_approved', 'requests.notify_stalled'])
            ->delete();
    }
};
