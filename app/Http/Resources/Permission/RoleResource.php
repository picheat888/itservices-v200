<?php

// A Role Template as the role endpoints return it after create, rename or duplicate.

namespace App\Http\Resources\Permission;

use App\Models\Permission\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Role */
class RoleResource extends JsonResource
{
    /**
     * @return array{key: string, name: string|null, color: string|null, is_system: bool}
     */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->key,
            'name' => $this->name,
            'color' => $this->color,
            'is_system' => (bool) $this->is_system,
        ];
    }
}
