<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The Request module ships for real: approval authority now comes from being
 * the resolved approver of a step (person-scoped), not from a permission key.
 * Map the legacy grants onto the new catalog for existing roles:
 *
 * - roles with requests.approve_it (IT staff) → requests.fulfill + requests.view_all
 * - roles with system.manage_permissions      → workflows.manage (workflow editor)
 *
 * The legacy keys (approve_manager / approve_it / reject) leave the catalog,
 * so their role_permissions rows are deleted.
 */
return new class extends Migration
{
    private const DROPPED_KEYS = ['requests.approve_manager', 'requests.approve_it', 'requests.reject'];

    public function up(): void
    {
        $this->grantWhereHas('requests.approve_it', ['requests.fulfill', 'requests.view_all']);
        $this->grantWhereHas('system.manage_permissions', ['workflows.manage']);

        DB::table('role_permissions')->whereIn('permission', self::DROPPED_KEYS)->delete();
    }

    public function down(): void
    {
        // Dropped legacy keys are not restored (they never gated real behavior).
        DB::table('role_permissions')
            ->whereIn('permission', ['requests.fulfill', 'workflows.manage'])
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
