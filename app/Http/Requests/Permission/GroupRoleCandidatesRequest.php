<?php

// People who can join a Role Group: one page, or a whole department with all=1.

namespace App\Http\Requests\Permission;

use App\Models\Permission\GroupRole;

class GroupRoleCandidatesRequest extends GroupRoleMembersRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'group_id' => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string'],
            'all' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer'],
        ];
    }

    public function group(): ?GroupRole
    {
        $groupId = $this->validated('group_id');

        return $groupId !== null ? GroupRole::find($groupId) : null;
    }

    public function departmentId(): ?int
    {
        $departmentId = $this->validated('department_id');

        return $departmentId !== null ? (int) $departmentId : null;
    }

    /** A whole list is only offered per department. */
    public function wantsWholeDepartment(): bool
    {
        return $this->boolean('all') && $this->departmentId() !== null;
    }
}
