<?php

namespace App\Http\Resources\Access;

use App\Models\Access\FileShare;
use App\Support\SystemTime;
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
            'size' => $this->size,
            'size_unit' => $this->size_unit,
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
            // When and by whom it was added / last changed (names when the index loaded creator/updater).
            'created_at' => SystemTime::date($this->created_at),
            'updated_at' => SystemTime::date($this->updated_at),
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'updated_by_name' => $this->whenLoaded('updater', fn () => $this->updater?->name),
        ];
    }
}
