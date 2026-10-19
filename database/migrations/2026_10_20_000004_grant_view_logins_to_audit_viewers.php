<?php

// Grants system.view_logins (the Login tab) to every role that already holds system.view_audit.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const AUDIT_KEY = 'system.view_audit';

    private const LOGINS_KEY = 'system.view_logins';

    public function up(): void
    {
        $now = now();
        $roleIds = DB::table('role_permissions')
            ->where('permission', self::AUDIT_KEY)
            ->where('allowed', true)
            ->pluck('role_id');

        foreach ($roleIds->chunk(100) as $chunk) {
            // Upsert: a Role Template saved before this ran already wrote the key as off
            DB::table('role_permissions')->upsert(
                $chunk->map(fn (int $roleId) => ['role_id' => $roleId, 'permission' => self::LOGINS_KEY, 'allowed' => true, 'created_at' => $now, 'updated_at' => $now])->all(),
                ['role_id', 'permission'],
                ['allowed', 'updated_at'],
            );
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('permission', self::LOGINS_KEY)->delete();
    }
};
