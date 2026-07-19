<?php

namespace App\Http\Resources\Access;

use App\Models\Access\EmailGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin EmailGroup */
class EmailGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'email' => $this->email,
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'description' => $this->description,
            'owner_employee_id' => $this->owner_employee_id,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner?->name),
            'owner_photo_url' => $this->whenLoaded('owner', fn () => $this->owner?->photo_url),
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'photo_url' => $m->employee?->photo_url,
                'access_level' => $m->access_level,
            ])->values()),
            'members_count' => $this->relationLoaded('memberships') ? $this->memberships->count() : $this->memberships()->active()->count(),
        ];
    }
}
