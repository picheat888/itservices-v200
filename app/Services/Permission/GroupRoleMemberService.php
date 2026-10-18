<?php

// Paged member and candidate lists for the Role Group dialog, so a large group is never sent whole.

namespace App\Services\Permission;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\User;
use App\Support\SearchTerms;
use App\Support\SuperAdmins;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator as Page;

class GroupRoleMemberService
{
    public function __construct(private GroupRoleGuards $guards) {}

    /** The group's members, searchable by name, code or department. */
    public function members(GroupRole $group, ?string $search, int $perPage): LengthAwarePaginator
    {
        $query = $this->baseQuery()->whereHas('groupRoles', fn (Builder $q) => $q->whereKey($group->id));
        $this->search($query, $search, withDepartment: true);

        return $query->paginate($perPage);
    }

    /** Active employees who are not in the group yet, with the group they sit in now; $all sends every match as one page. */
    public function candidates(?GroupRole $group, ?string $search, ?int $departmentId, bool $all, int $perPage): LengthAwarePaginator
    {
        $query = $this->candidateQuery($group, $search, $departmentId)->with('groupRoles:id,name');

        if (! $all) {
            return $query->paginate($perPage);
        }

        $everyone = $query->get();

        return new Page($everyone, $everyone->count(), max(1, $everyone->count()), 1);
    }

    /** How many candidates the caller may add: none to a group they may not add to, never their own employee, and no Super admin unless they are one. */
    public function addableCount(?GroupRole $group, ?string $search, ?int $departmentId, User $caller): int
    {
        if ($this->guards->refusesEveryAdd($caller, $group)) {
            return 0;
        }

        $ids = $this->candidateQuery($group, $search, $departmentId)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $ids = array_values(array_diff($ids, $caller->linkedEmployeeIds()));

        if (! $caller->isSuper()) {
            $ids = array_diff($ids, SuperAdmins::protectedEmployeeIds($ids));
        }

        return count($ids);
    }

    private function candidateQuery(?GroupRole $group, ?string $search, ?int $departmentId): Builder
    {
        $query = $this->baseQuery()->where('status', EmployeeStatus::Active->value);

        if ($group) {
            $query->whereDoesntHave('groupRoles', fn (Builder $q) => $q->whereKey($group->id));
        }
        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }
        $this->search($query, $search, withDepartment: false);

        return $query;
    }

    private function baseQuery(): Builder
    {
        return Employee::query()
            ->select(['id', 'code', 'first_name', 'last_name', 'first_name_th', 'last_name_th', 'department_id', 'status'])
            ->with('department:id,name,name_th')
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->orderBy('id');
    }

    private function search(Builder $query, ?string $search, bool $withDepartment): void
    {
        SearchTerms::apply($query, $search, [
            ...SearchTerms::personName(), 'code',
            ...($withDepartment ? [SearchTerms::related('department', ['name', 'name_th'])] : []),
        ]);
    }
}
