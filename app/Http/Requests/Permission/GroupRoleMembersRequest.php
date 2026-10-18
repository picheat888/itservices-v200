<?php

// One page of a Role Group's members: an optional search and a page size kept between 10 and 100.

namespace App\Http\Requests\Permission;

class GroupRoleMembersRequest extends ManageGroupsRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer'],
        ];
    }

    public function search(): ?string
    {
        return $this->validated('search');
    }

    public function perPage(): int
    {
        return max(10, min(100, (int) ($this->validated('per_page') ?? 20)));
    }
}
