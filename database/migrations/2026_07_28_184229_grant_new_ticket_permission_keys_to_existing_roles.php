<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The Tickets module moved to a hierarchical permission tree (module master,
 * dashboard, forward, per-category Levels, edit_own, jobs). Existing roles keep
 * working by mapping their old grants onto the new keys:
 *
 * - roles with tickets.view_all (staff) → the full staff set: module,
 *   view_dashboard, forward, jobs and all four Levels
 * - roles with tickets.create (requesters) → edit_own + my (file, fix and
 *   track their own cases, exactly what they could do before)
 */
return new class extends Migration
{
    private const STAFF_KEYS = [
        'tickets.module', 'tickets.view_dashboard', 'tickets.forward', 'tickets.jobs',
        'tickets.level_hardware', 'tickets.level_software', 'tickets.level_network', 'tickets.level_other',
    ];

    private const REQUESTER_KEYS = ['tickets.edit_own', 'tickets.my'];

    public function up(): void
    {
        $this->grantWhereHas('tickets.view_all', self::STAFF_KEYS);
        $this->grantWhereHas('tickets.create', self::REQUESTER_KEYS);
    }

    public function down(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', [...self::STAFF_KEYS, ...self::REQUESTER_KEYS])
            ->delete();
    }

    /** Grants $keys to every role that already holds $marker (idempotent upsert). */
    private function grantWhereHas(string $marker, array $keys): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', $marker)->where('allowed', true)
            ->pluck('role_id');

        foreach ($roleIds as $roleId) {
            foreach ($keys as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => true, 'updated_at' => now()],
                );
            }
        }
    }
};
