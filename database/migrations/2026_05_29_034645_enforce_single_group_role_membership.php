<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Enforce "one employee belongs to exactly one Role Group":
     *   1. Reconcile existing memberships down to a single surviving group per
     *      employee (role-matching > default group > lowest group id).
     *   2. Add a unique index on group_role_employee.employee_id.
     */
    public function up(): void
    {
        $this->reconcileToSingleGroup();

        Schema::table('group_role_employee', function (Blueprint $table) {
            $table->unique('employee_id', 'group_role_employee_employee_id_unique');
        });
    }

    /**
     * Reversing only removes the constraint; the deleted duplicate memberships
     * are not restored.
     */
    public function down(): void
    {
        Schema::table('group_role_employee', function (Blueprint $table) {
            $table->dropUnique('group_role_employee_employee_id_unique');
        });
    }

    /**
     * Collapses every employee's group memberships to one surviving row. The
     * survivor is the group whose role matches the employee's linked User.role;
     * failing that, the configured default group (if the employee is in it);
     * failing that, the lowest group id the employee currently belongs to.
     */
    private function reconcileToSingleGroup(): void
    {
        $defaultGroupId = (int) DB::table('app_settings')
            ->where('key', 'default_employee_group_id')
            ->value('value');

        // Group memberships keyed by employee id.
        $byEmployee = DB::table('group_role_employee')
            ->get()
            ->groupBy('employee_id');

        foreach ($byEmployee as $employeeId => $rows) {
            if ($rows->count() <= 1) {
                continue;
            }

            $groupIds = $rows->pluck('group_role_id')->all();
            $survivor = $this->pickSurvivingGroup((int) $employeeId, $groupIds, $defaultGroupId);

            DB::table('group_role_employee')
                ->where('employee_id', $employeeId)
                ->where('group_role_id', '!=', $survivor)
                ->delete();
        }
    }

    /**
     * @param  array<int, int>  $groupIds  groups the employee currently belongs to
     */
    private function pickSurvivingGroup(int $employeeId, array $groupIds, int $defaultGroupId): int
    {
        $employee = DB::table('employees')->where('id', $employeeId)->first();

        // 1. Group whose role matches the linked user's current role.
        if ($employee) {
            $userRole = DB::table('users')
                ->when($employee->email, fn ($q) => $q->orWhere('email', $employee->email))
                ->when($employee->username, fn ($q) => $q->orWhere('username', $employee->username))
                ->value('role');

            if ($userRole) {
                $match = DB::table('group_roles')
                    ->whereIn('id', $groupIds)
                    ->where('role', $userRole)
                    ->min('id');

                if ($match) {
                    return (int) $match;
                }
            }
        }

        // 2. The configured default group, if the employee is in it.
        if ($defaultGroupId && in_array($defaultGroupId, $groupIds, true)) {
            return $defaultGroupId;
        }

        // 3. Last resort: the lowest group id the employee belongs to.
        return min($groupIds);
    }
};
