<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Grants each Dashboard switch to every role holding the right that showed that section before.
return new class extends Migration
{
    private const FROM = [
        'tickets.view_all' => 'dashboard.view_it',
        'requests.view_all' => 'dashboard.view_requests',
        'contracts.module' => 'dashboard.view_contracts',
        'employees.view_dashboard' => 'dashboard.view_hr',
        'system.view_audit' => 'dashboard.view_activity',
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::FROM as $source => $switch) {
            $rows = DB::table('role_permissions')
                ->where('permission', $source)
                ->where('allowed', true)
                ->pluck('role_id')
                ->map(fn ($roleId) => ['role_id' => $roleId, 'permission' => $switch, 'allowed' => true, 'created_at' => $now, 'updated_at' => $now])
                ->all();

            // Upsert: a Role Template saved before this ran already wrote the switch as off.
            DB::table('role_permissions')->upsert($rows, ['role_id', 'permission'], ['allowed', 'updated_at']);
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->whereIn('permission', array_values(self::FROM))->delete();
    }
};
