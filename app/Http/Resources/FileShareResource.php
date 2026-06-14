<?php

namespace App\Http\Resources;

use App\Models\FileShare;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin FileShare */
class FileShareResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'path' => $this->path,
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'size_label' => $this->size_label,
            'owner_employee_id' => $this->owner_employee_id,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner?->name),
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'access_level' => $m->access_level,
            ])->values()),
            'members_count' => $this->relationLoaded('memberships') ? $this->memberships->count() : $this->memberships()->active()->count(),
        ];
    }
}
