<?php

namespace App\Http\Resources\Access;

use App\Models\Access\Software;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Software */
class SoftwareResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $seatsUsed = $this->relationLoaded('memberships')
            ? $this->memberships->count()
            : $this->memberships()->active()->count();

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'publisher' => $this->publisher,
            'version' => $this->version,
            'license_type' => $this->license_type?->value,
            'seats' => $this->seats,
            'seats_used' => $seatsUsed,
            'department_id' => $this->department_id,
            'department' => $this->department?->name,
            'notes' => $this->notes,
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'purpose' => $m->purpose,
            ])->values()),
            'members_count' => $seatsUsed,
        ];
    }
}
