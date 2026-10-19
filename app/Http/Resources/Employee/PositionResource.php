<?php

namespace App\Http\Resources\Employee;

use App\Models\Employee\Position;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Position */
class PositionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'allow_special_position' => (bool) $this->allow_special_position,
            'employees_count' => $this->whenCounted('employees', $this->employees_count, $this->employees()->count()),
            'active_employees_count' => $this->whenCounted('active_employees'),
        ];
    }
}
