<?php

namespace App\Http\Resources\Access;

use App\Models\Access\SocialPlatform;
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
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'purpose' => $m->purpose,
            ])->values()),
            'members_count' => $this->relationLoaded('memberships') ? $this->memberships->count() : $this->memberships()->active()->count(),
        ];
    }
}
