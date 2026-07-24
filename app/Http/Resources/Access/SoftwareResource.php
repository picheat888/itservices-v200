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

        // The product key is a secret: expose its value only to people who can
        // edit software (who also own the edit form); everyone else just learns
        // whether a key is on file.
        $canManage = (bool) $request->user()?->hasPermission('access.software_edit');

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'publisher' => $this->brand?->name,
            'brand_id' => $this->brand_id,
            'logo_url' => $this->logo_url,
            'license_type' => $this->license_type?->value,
            'seats' => $this->seats,
            'seats_used' => $seatsUsed,
            'has_product_key' => filled($this->product_key),
            'product_key' => $canManage ? $this->product_key : null,
            'notes' => $this->notes,
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'photo_url' => $m->employee?->photo_url,
                'purpose' => $m->purpose,
            ])->values()),
            'members_count' => $seatsUsed,
        ];
    }
}
