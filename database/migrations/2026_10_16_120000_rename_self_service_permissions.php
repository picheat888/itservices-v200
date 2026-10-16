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
            $profileKeys = array_values(self::RENAMES);

            // role_id => whether any profile key is allowed, read before the keys are renamed back
            $grantByRole = DB::table('role_permissions')
                ->whereIn('permission', $profileKeys)
                ->get(['role_id', 'allowed'])
                ->groupBy('role_id')
                ->map(fn ($rows): bool => $rows->contains(fn ($row): bool => (bool) $row->allowed));

            foreach (self::RENAMES as $old => $new) {
                $this->rename($new, $old);
            }

            foreach (self::DROPPED as $key) {
                foreach ($grantByRole as $roleId => $allowed) {
                    $exists = DB::table('role_permissions')
                        ->where('role_id', $roleId)
                        ->where('permission', $key)
                        ->exists();

                    if (! $exists) {
                        DB::table('role_permissions')->insert([
                            'role_id' => $roleId,
                            'permission' => $key,
                            'allowed' => $allowed,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }
            }
        });
    }

    // A role holding both keys keeps the target row with the stronger grant; the rest are renamed in place.
    private function rename(string $from, string $to): void
    {
        $sourceRows = DB::table('role_permissions')
            ->where('permission', $from)
            ->get(['role_id', 'allowed']);

        foreach ($sourceRows as $source) {
            $target = DB::table('role_permissions')
                ->where('role_id', $source->role_id)
                ->where('permission', $to)
                ->first(['id', 'allowed']);

            if ($target === null) {
                continue;
            }

            if ((bool) $source->allowed && ! (bool) $target->allowed) {
                DB::table('role_permissions')
                    ->where('id', $target->id)
                    ->update(['allowed' => true, 'updated_at' => now()]);
            }

            DB::table('role_permissions')
                ->where('role_id', $source->role_id)
                ->where('permission', $from)
                ->delete();
        }

        DB::table('role_permissions')
            ->where('permission', $from)
            ->update(['permission' => $to]);
    }
};
