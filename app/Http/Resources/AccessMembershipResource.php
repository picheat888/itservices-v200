<?php

namespace App\Http\Resources;

use App\Models\AccessMembership;
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
            'access_level' => $this->access_level,
            'purpose' => $this->purpose,
            'granted_at' => $this->granted_at?->toDateString(),
            'revoked_at' => $this->revoked_at?->toDateString(),
        ];
    }
}
