<?php

namespace App\Http\Resources\Access;

use App\Models\Access\SocialPlatform;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SocialPlatform */
class SocialPlatformResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'url' => $this->url,
            'color' => $this->color,
            'policy' => $this->policy,
            'logo_url' => $this->logo_url,
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'photo_url' => $m->employee?->photo_url,
                'purpose' => $m->purpose,
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
