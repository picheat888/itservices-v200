<?php

namespace App\Http\Resources;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Employee */
class OrgChartNodeResource extends JsonResource
{
    /**
     * One node in the org chart: identity, position/department labels, photo,
     * the manager link, and a count of active direct reports.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'title' => $this->position?->title,
            'level' => $this->position?->level,
            'department' => $this->department?->name,
            'photo_url' => $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null,
            'manager_id' => $this->manager_id,
            'reports_count' => (int) ($this->reports_count ?? 0),
        ];
    }
}
