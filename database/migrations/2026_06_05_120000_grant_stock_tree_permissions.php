<?php

use App\Models\RolePermission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Introduce the stock tree keys for existing roles so no current user loses
     * access: any role with a stock.* grant gets the master; holders of the old
     * module-wide stock.view gain the per-tab dashboard/request/events views.
     * Additive and idempotent (updateOrCreate).
     */
    public function up(): void
    {
        $roleIds = RolePermission::where('permission', 'like', 'stock.%')
            ->where('allowed', true)
            ->distinct()
            ->pluck('role_id');

        foreach ($roleIds as $roleId) {
            $has = fn (string $key) => RolePermission::where('role_id', $roleId)
                ->where('permission', $key)->where('allowed', true)->exists();

            $grants = ['stock.module'];
            if ($has('stock.view')) {
                $grants = array_merge($grants, ['stock.view_dashboard', 'stock.view_events', 'stock.view_request']);
            }
            if ($has('stock.request')) {
                $grants[] = 'stock.view_request';
            }

            foreach (array_unique($grants) as $key) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => true],
                );
            }
        }
    }

    /** Irreversible data backfill. */
    public function down(): void
    {
        //
    }
};
