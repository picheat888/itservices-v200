<?php

// Slim employee row for pickers and lookups: identity, department, position, status only.

namespace App\Http\Resources\Employee;

use App\Models\Employee\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Employee */
class EmployeeOptionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'photo_url' => $this->photo_url,
            'department_id' => $this->department_id,
            'department' => $this->department?->name,
            'department_th' => $this->department?->name_th,
            'position' => $this->position?->title,
            'status' => $this->status?->value ?? 'active',
        ];
    }
}
