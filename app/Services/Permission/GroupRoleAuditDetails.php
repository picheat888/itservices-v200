<?php

// Audit details for Role Group writes: who joined, who left, and every login account whose role moved.

namespace App\Services\Permission;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\User;

class GroupRoleAuditDetails
{
    /**
     * The role id of every login account tied to the employees (same match as GroupMembershipWriter::syncUserRoles).
     *
     * @param  array<int>  $employeeIds
     * @return array<int, int|null> user id => role id
     */
    public function accountRoles(array $employeeIds): array
    {
        if ($employeeIds === []) {
            return [];
        }

        $usernames = Employee::whereIn('id', $employeeIds)->pluck('username')->filter();

        return User::where(function ($q) use ($employeeIds, $usernames) {
            $q->whereIn('employee_id', $employeeIds)
                ->orWhereIn('username', $usernames);
        })
            ->pluck('role_id', 'id')
            ->map(fn ($roleId) => $roleId === null ? null : (int) $roleId)
            ->all();
    }

    /**
     * @param  array<int>  $addedEmployeeIds
     * @param  array<int>  $removedEmployeeIds
     * @param  array<int, int|null>  $rolesBefore  accountRoles() taken before the writes
     * @return array{added?: list<string>, removed?: list<string>, role_changes?: list<array{name: string, from: string|null, to: string|null}>}
     */
    public function membership(array $addedEmployeeIds, array $removedEmployeeIds, array $rolesBefore): array
    {
        $memberLabels = Employee::whereIn('id', [...$addedEmployeeIds, ...$removedEmployeeIds])
            ->get()
            ->mapWithKeys(fn (Employee $employee) => [$employee->id => "{$employee->name} ({$employee->code})"]);
        $labelsOf = fn (array $employeeIds) => $memberLabels->only($employeeIds)->sort()->values()->all();

        $changedAccounts = User::whereIn('id', array_keys($rolesBefore))
            ->get(['id', 'name', 'role_id'])
            ->filter(fn (User $account) => ($account->role_id === null ? null : (int) $account->role_id) !== $rolesBefore[$account->id]);
        $roleIds = $changedAccounts->flatMap(fn (User $account) => [$account->role_id, $rolesBefore[$account->id]])->filter()->unique();
        $roleNames = Role::whereIn('id', $roleIds)->get()->mapWithKeys(fn (Role $role) => [$role->id => $role->name ?? $role->key]);

        $roleChanges = $changedAccounts
            ->map(fn (User $account) => [
                'name' => $account->name,
                'from' => $roleNames->get($rolesBefore[$account->id]),
                'to' => $roleNames->get($account->role_id),
            ])
            ->sortBy('name')
            ->values()
            ->all();

        return array_filter([
            'added' => $labelsOf($addedEmployeeIds),
            'removed' => $labelsOf($removedEmployeeIds),
            'role_changes' => $roleChanges,
        ]);
    }
}
