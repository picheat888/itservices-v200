<?php

// Members of a department, position or section: the counts their lists show and the order their members come in.

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UnitMembers
{
    /**
     * withCount / loadCount spec: everyone as employees_count, staff still working there as active_employees_count.
     *
     * @return array<int|string, mixed>
     */
    public function counts(): array
    {
        return [
            'employees',
            'employees as active_employees_count' => fn (Builder $q) => $q->where('status', EmployeeStatus::Active->value),
        ];
    }

    /**
     * A unit's members for its members dialog: leavers last, then by name.
     *
     * @param  HasMany<Employee, *>  $employees
     * @return Collection<int, Employee>
     */
    public function list(HasMany $employees): Collection
    {
        return $employees->with(['department', 'position', 'section', 'user'])
            ->orderByRaw('status = ?', [EmployeeStatus::Resigned->value])
            ->orderBy('first_name')->orderBy('last_name')
            ->get();
    }
}
