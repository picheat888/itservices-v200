<?php

// Gives every role that may file requests all 13 type keys (repairing a submit role saved with none), and IT leads holding view_all the cancel_any right; other roles get denied rows.

use App\Enums\Request\RequestType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const CANCEL_ANY = 'requests.cancel_any';

    private const CANCEL_ANY_ROLES = ['admin', 'it_supervisorleader'];

    public function up(): void
    {
        DB::transaction(function (): void {
            $filerIds = DB::table('role_permissions')
                ->where('permission', 'requests.submit')
                ->where('allowed', true)
                ->pluck('role_id')
                ->all();
            $cancelIds = DB::table('roles')
                ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
                ->whereIn('roles.key', self::CANCEL_ANY_ROLES)
                ->where('role_permissions.permission', 'requests.view_all')
                ->where('role_permissions.allowed', true)
                ->pluck('roles.id')
                ->all();

            $typeKeys = $this->typeKeys();

            foreach (DB::table('roles')->pluck('id') as $roleId) {
                $holdsNoType = ! DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->whereIn('permission', $typeKeys)
                    ->where('allowed', true)
                    ->exists();
                if (in_array($roleId, $filerIds) && $holdsNoType) {
                    DB::table('role_permissions')
                        ->where('role_id', $roleId)
                        ->whereIn('permission', $typeKeys)
                        ->update(['allowed' => true, 'updated_at' => now()]);
                }

                foreach ($this->typeKeys() as $key) {
                    $this->addRow($roleId, $key, in_array($roleId, $filerIds));
                }
                $this->addRow($roleId, self::CANCEL_ANY, in_array($roleId, $cancelIds));
            }
        });
    }

    public function down(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', [...$this->typeKeys(), self::CANCEL_ANY])
            ->delete();
    }

    /** @return list<string> */
    private function typeKeys(): array
    {
        return array_map(fn (RequestType $type) => "requests.submit_{$type->value}", RequestType::cases());
    }

    // Existing rows (an admin's own choice) are never overwritten.
    private function addRow(int $roleId, string $key, bool $allowed): void
    {
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
};
