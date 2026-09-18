<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `tickets.level_cctv` and `tickets.level_telephone` to every role that already holds
 * all four of the original ticket levels.
 *
 * Ticket levels are strict: no level for a category means the staff member never sees those
 * cases, cannot take them, and is not alerted about them. So the moment CCTV and Telephone
 * exist as categories, the first case filed under either is invisible to the whole desk —
 * not refused, just silently absent from every list — until somebody thinks to open the
 * Permissions page. That is a failure nobody would go looking for.
 *
 * Matched on holding ALL FOUR existing levels, not any one of them: a role narrowed on
 * purpose to, say, network only, was narrowed by somebody who meant it, and widening it
 * here would undo a decision this migration knows nothing about. Only a role already
 * trusted with every category is assumed to be trusted with two more.
 */
return new class extends Migration
{
    /** The levels that existed before this migration. */
    private const EXISTING = [
        'tickets.level_hardware',
        'tickets.level_software',
        'tickets.level_network',
        'tickets.level_other',
    ];

    private const ADDED = ['tickets.level_cctv', 'tickets.level_telephone'];

    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->whereIn('permission', self::EXISTING)
            ->where('allowed', true)
            ->groupBy('role_id')
            ->havingRaw('COUNT(DISTINCT permission) = ?', [count(self::EXISTING)])
            ->pluck('role_id')
            ->all();

        foreach ($roleIds as $roleId) {
            foreach (self::ADDED as $permission) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true, 'updated_at' => now(), 'created_at' => now()],
                );
            }
        }
    }

    /** Roles keep everything they had before; only the two new keys go. */
    public function down(): void
    {
        DB::table('role_permissions')->whereIn('permission', self::ADDED)->delete();
    }
};
