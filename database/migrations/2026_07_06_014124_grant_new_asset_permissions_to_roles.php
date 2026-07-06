<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Grant the newly added asset permissions to existing roles per the default set
     * (fresh installs get them from the seeder). Idempotent and additive — it never
     * removes an admin's customised grants.
     *
     * @var array<string, list<string>>
     */
    private array $grants = [
        'admin' => ['assets.receive', 'assets.my'],
        'hr' => ['assets.my'],
        'user' => ['assets.my'],
    ];

    public function up(): void
    {
        foreach ($this->grants as $roleKey => $permissions) {
            $roleId = DB::table('roles')->where('key', $roleKey)->value('id');
            if (! $roleId) {
                continue;
            }
            foreach ($permissions as $permission) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true],
                );
            }
        }
    }

    public function down(): void
    {
        foreach ($this->grants as $roleKey => $permissions) {
            $roleId = DB::table('roles')->where('key', $roleKey)->value('id');
            if (! $roleId) {
                continue;
            }
            DB::table('role_permissions')->where('role_id', $roleId)->whereIn('permission', $permissions)->delete();
        }
    }
};
