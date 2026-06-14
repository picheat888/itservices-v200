<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Expects ['email_group'=>Collection,'file_share'=>Collection,'social_platform'=>Collection,'outstanding'=>bool].
 */
class EmployeeAccessResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $map = fn ($items) => collect($items)->map(fn ($m) => [
            'id' => $m->id,
            'resource_id' => $m->resource_id,
            'resource_name' => $m->resource?->name,
            'resource_code' => $m->resource?->code,
            'resource_detail' => $m->resource?->email ?? $m->resource?->path ?? $m->resource?->url,
            'resource_color' => $m->resource?->color,
            'access_level' => $m->access_level,
            'purpose' => $m->purpose,
            'granted_at' => $m->granted_at?->toDateString(),
        ])->values();

        return [
            'email_groups' => $map($this->resource['email_group']),
            'file_shares' => $map($this->resource['file_share']),
            'social' => $map($this->resource['social_platform']),
            'outstanding' => (bool) ($this->resource['outstanding'] ?? false),
        ];
    }
}
