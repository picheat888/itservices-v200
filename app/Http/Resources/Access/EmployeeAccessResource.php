<?php

namespace App\Http\Resources\Access;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Expects ['email_group'=>Collection,'file_share'=>Collection,'social_platform'=>Collection,'software'=>Collection,'outstanding'=>bool].
 */
class EmployeeAccessResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $employeeId = $this->resource['employee_id'] ?? null;

        $map = fn ($items) => collect($items)->map(fn ($m) => [
            'id' => $m->id,
            'resource_id' => $m->resource_id,
            'resource_name' => $m->resource?->name,
            'resource_code' => $m->resource?->code,
            'resource_detail' => $m->resource?->email ?? $m->resource?->path ?? $m->resource?->url ?? $m->resource?->brand?->name,
            'resource_color' => $m->resource?->color,
            // Social platforms + software expose an uploaded logo; other resource types return null.
            'resource_logo' => $m->resource?->logo_url,
            'access_level' => $m->access_level,
            'purpose' => $m->purpose,
            'granted_at' => $m->granted_at?->toDateString(),
            // True when this employee is the resource's owner/approver (email groups + file shares).
            'is_owner' => $employeeId !== null && $m->resource?->owner_employee_id === $employeeId,
        ])->values();

        return [
            'email_groups' => $map($this->resource['email_group']),
            'file_shares' => $map($this->resource['file_share']),
            'social' => $map($this->resource['social_platform']),
            'software' => $map($this->resource['software']),
            'outstanding' => (bool) ($this->resource['outstanding'] ?? false),
        ];
    }
}
