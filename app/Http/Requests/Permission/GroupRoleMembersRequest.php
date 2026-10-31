<?php

// One page of a Role Group's members: an optional search and a page size kept between 10 and 100.

namespace App\Http\Requests\Permission;

use App\Support\PerPage;

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
        return PerPage::clamp($this->validated('per_page') ?? PerPage::DEFAULT);
    }
}
