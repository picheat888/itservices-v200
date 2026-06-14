<?php

namespace App\Http\Resources;

use App\Models\SocialPlatform;
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
            'members_count' => $this->memberships()->active()->count(),
        ];
    }
}
