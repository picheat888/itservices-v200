<?php

// Moves role_permissions rows from the retired self-service keys to the My Profile keys.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const RENAMES = [
        'employees.edit_own' => 'profile.edit',
        'assets.return' => 'profile.return_assets',
    ];

    private const DROPPED = ['assets.my', 'access.my'];

    public function up(): void
    {
        DB::transaction(function (): void {
            foreach (self::RENAMES as $old => $new) {
                $this->rename($old, $new);
            }

            DB::table('role_permissions')->whereIn('permission', self::DROPPED)->delete();
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            $roleIds = DB::table('role_permissions')
                ->whereIn('permission', array_values(self::RENAMES))
                ->pluck('role_id')
                ->unique();

            foreach (self::RENAMES as $old => $new) {
                $this->rename($new, $old);
            }

            foreach (self::DROPPED as $key) {
                foreach ($roleIds as $roleId) {
                    $exists = DB::table('role_permissions')
                        ->where('role_id', $roleId)
                        ->where('permission', $key)
                        ->exists();

                    if (! $exists) {
                        DB::table('role_permissions')->insert([
                            'role_id' => $roleId,
                            'permission' => $key,
                            'allowed' => true,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }
            }
        });
    }

    // Roles that already hold the target key lose the source row; the rest get it renamed.
    private function rename(string $from, string $to): void
    {
        $hasTarget = DB::table('role_permissions')->where('permission', $to)->pluck('role_id');

        DB::table('role_permissions')
            ->where('permission', $from)
            ->whereIn('role_id', $hasTarget)
            ->delete();

        DB::table('role_permissions')
            ->where('permission', $from)
            ->update(['permission' => $to]);
    }
};
