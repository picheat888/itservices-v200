<?php

// The "never leave zero Super admins" rule shared by every write that can remove one.

namespace App\Support;

use App\Enums\UserRole;
use App\Models\Employee\Employee;
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

    /** Whether only a Super admin may manage this employee, see protectedEmployeeIds(). */
    public static function protectsEmployee(Employee $employee): bool
    {
        return self::protectedEmployeeIds([$employee->id]) !== [];
    }

    /**
     * The ids among these employees that sit in a super-role group or have a super login (by employee_id or username).
     *
     * @param  array<int>  $employeeIds
     * @return array<int>
     */
    public static function protectedEmployeeIds(array $employeeIds): array
    {
        if ($employeeIds === []) {
            return [];
        }
        $roleId = self::roleId();
        if ($roleId === null) {
            return [];
        }

        $inSuperGroup = DB::table('group_role_employee')
            ->join('group_roles', 'group_roles.id', '=', 'group_role_employee.group_role_id')
            ->where('group_roles.role_id', $roleId)
            ->whereIn('group_role_employee.employee_id', $employeeIds)
            ->pluck('group_role_employee.employee_id');

        // Same account match as GroupRoleController::syncUserRoles
        $withSuperAccount = DB::table('employees')
            ->join('users', fn ($join) => $join->on('users.employee_id', '=', 'employees.id')->orOn('users.username', '=', 'employees.username'))
            ->where('users.role_id', $roleId)
            ->whereIn('employees.id', $employeeIds)
            ->pluck('employees.id');

        return $inSuperGroup->merge($withSuperAccount)->map(fn ($id) => (int) $id)->unique()->values()->all();
    }

    /** Locks the super accounts and says whether any is left; a locking read sees a concurrent removal's commit. */
    private static function lockedSuperAdminsRemain(?int $roleId): bool
    {
        return $roleId !== null && User::where('role_id', $roleId)->lockForUpdate()->pluck('id')->isNotEmpty();
    }

    /**
     * Runs the writes in one transaction and rolls back with a 422 when they removed the last Super admin.
     * The transaction opens with locking reads only; the writes must take their own locks before any plain read.
     * $attempts > 1 retries on a deadlock or a changed record, for writes that re-read everything they use.
     *
     * @template T
     *
     * @param  callable(): T  $writes
     * @return T
     */
    public static function keepAtLeastOne(callable $writes, int $attempts = 1): mixed
    {
        $roleId = self::roleId();

        try {
            return DB::transaction(function () use ($writes, $roleId) {
                // A retried attempt must not see settings cached by the rolled-back one
                AppSetting::flushCache();
                $hadSuperAdmin = self::lockedSuperAdminsRemain($roleId);
                $result = $writes();

                if ($hadSuperAdmin && ! self::lockedSuperAdminsRemain($roleId)) {
                    throw new HttpResponseException(response()->json([
                        'message' => 'At least one Administrator account must remain.',
                        'code' => 'last_super_admin',
                    ], 422));
                }

                return $result;
            }, $attempts);
        } catch (Throwable $failure) {
            // Settings read inside the rolled-back writes
            AppSetting::flushCache();

            throw $failure;
        }
    }
}
