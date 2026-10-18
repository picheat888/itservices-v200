<?php

// One Role Group in the list: its role, member count, and whether the caller's own employee sits in it.

namespace App\Http\Resources\Permission;

use App\Models\Permission\GroupRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin GroupRole */
class GroupRoleResource extends JsonResource
{
    /**
     * @param  array<int>  $myGroupIds  ids of the groups holding the caller's own employee
     */
    public function __construct(GroupRole $group, private array $myGroupIds = [])
    {
        parent::__construct($group);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->role?->key,
            'role_label' => $this->role ? ($this->role->name ?? $this->role->key) : null,
            'member_count' => $this->employees_count ?? $this->employees()->count(),
            // The caller's own employee sits here: nobody may change its role or their own membership
            'includes_me' => in_array($this->id, $this->myGroupIds, true),
        ];
    }
}
