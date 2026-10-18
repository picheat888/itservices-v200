<?php

// The "never leave zero Super admins" rule shared by every write that can remove one.

namespace App\Support;

use App\Enums\UserRole;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Throwable;

class SuperAdmins
{
    /** The id of the role keyed exactly `super`, or null when there is none. */
    public static function roleId(): ?int
    {
        return RoleKeys::find(UserRole::SuperAdmin->value)?->id;
    }

    public static function exists(): bool
    {
        $roleId = self::roleId();

        return $roleId !== null && User::where('role_id', $roleId)->exists();
    }

    /**
     * Runs the writes in one transaction and rolls back with a 422 when they removed the last Super admin.
     *
     * @template T
     *
     * @param  callable(): T  $writes
     * @return T
     */
    public static function keepAtLeastOne(callable $writes): mixed
    {
        try {
            return DB::transaction(function () use ($writes) {
                $hadSuperAdmin = self::exists();
                $result = $writes();

                if ($hadSuperAdmin && ! self::exists()) {
                    throw new HttpResponseException(response()->json([
                        'message' => 'At least one Administrator account must remain.',
                        'code' => 'last_super_admin',
                    ], 422));
                }

                return $result;
            });
        } catch (Throwable $failure) {
            // Settings read inside the rolled-back writes
            AppSetting::flushCache();

            throw $failure;
        }
    }
}
