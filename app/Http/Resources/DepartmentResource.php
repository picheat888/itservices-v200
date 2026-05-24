<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Department */
class DepartmentResource extends JsonResource
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
            'head' => $this->head,
            'location' => $this->location,
            'count' => $this->whenCounted('employees', $this->employees_count, $this->employees()->count()),
        ];
    }
}
