<?php

// Paged member and candidate lists for the Role Group dialog, so a large group is never sent whole.

namespace App\Services\Permission;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class GroupRoleMemberService
{
    /** A whole department picked at once is capped here. */
    public const MAX_ALL = 500;

    /** The group's members, searchable by name, code or department. */
    public function members(GroupRole $group, mixed $search, int $perPage): LengthAwarePaginator
    {
        $query = $this->baseQuery()->whereHas('groupRoles', fn (Builder $q) => $q->whereKey($group->id));
        $this->search($query, $search, withDepartment: true);

        return $query->paginate($perPage);
    }

    /**
     * Active employees who are not in the group yet, with the group they sit in now.
     *
     * @return LengthAwarePaginator|Collection<int, Employee>
     */
    public function candidates(?GroupRole $group, mixed $search, ?int $departmentId, bool $all, int $perPage): LengthAwarePaginator|Collection
    {
        $query = $this->baseQuery()
            ->with('groupRoles:id,name')
            ->where('status', EmployeeStatus::Active->value);

        if ($group) {
            $query->whereDoesntHave('groupRoles', fn (Builder $q) => $q->whereKey($group->id));
        }
        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }
        $this->search($query, $search, withDepartment: false);

        return $all ? $query->limit(self::MAX_ALL)->get() : $query->paginate($perPage);
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

    private function search(Builder $query, mixed $search, bool $withDepartment): void
    {
        SearchTerms::apply($query, $search, [
            ...SearchTerms::personName(), 'code',
            ...($withDepartment ? [SearchTerms::related('department', ['name', 'name_th'])] : []),
        ]);
    }
}
