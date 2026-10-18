<?php

// One person in the Role Group dialog: identity, department, the group they sit in now, and whether only a Super admin may move them.

namespace App\Http\Resources\Permission;

use App\Models\Employee\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Employee */
class GroupRoleMemberResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $group = $this->relationLoaded('groupRoles') ? $this->groupRoles->first() : null;

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'department' => $this->department?->name,
            'department_th' => $this->department?->name_th,
            'group_id' => $group?->id,
            'group' => $group?->name,
            // The controller puts the page's Super-admin employee ids on the request
            'protected' => in_array($this->id, (array) $request->attributes->get('protected_employee_ids', []), true),
        ];
    }
}
