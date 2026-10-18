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
        $roleId = self::roleId();
        if ($roleId === null || $employeeIds === []) {
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
                // Concurrent removals wait here
                $roleId = self::roleId();
                if ($roleId !== null) {
                    User::where('role_id', $roleId)->lockForUpdate()->pluck('id');
                }

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
