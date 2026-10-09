<?php

namespace App\Http\Resources\Access;

use App\Models\Access\AccessMembership;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AccessMembership */
class AccessMembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee?->name),
            'photo_url' => $this->whenLoaded('employee', fn () => $this->employee?->photo_url),
            'access_level' => $this->access_level,
            'purpose' => $this->purpose,
            'granted_at' => SystemTime::dateTime($this->granted_at),
            'granted_by' => $this->whenLoaded('grantedBy', fn () => $this->grantedBy?->name),
            'revoked_at' => SystemTime::dateTime($this->revoked_at),
            'revoked_by' => $this->whenLoaded('revokedBy', fn () => $this->revokedBy?->name),
        ];
    }
}
