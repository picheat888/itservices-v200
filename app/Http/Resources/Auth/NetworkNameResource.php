<?php

// One admin-named IP range as the Settings → Security network list shows it.

namespace App\Http\Resources\Auth;

use App\Models\Auth\NetworkName;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin NetworkName */
class NetworkNameResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'cidr' => $this->cidr,
            'name' => $this->name,
        ];
    }
}
