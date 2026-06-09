<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Section */
class SectionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'department_id' => $this->department_id,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'members_count' => $this->whenCounted('employees', $this->employees_count, $this->employees()->count()),
        ];
    }
}
