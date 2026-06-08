<?php

namespace App\Http\Resources;

use App\Enums\EmployeeStatus;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Employee */
class ApproverNodeResource extends JsonResource
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
            'photo_url' => $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null,
            'position' => $this->position?->title,
            'level' => $this->position?->level,
            'department' => $this->department?->name,
            'status' => $this->status instanceof EmployeeStatus ? $this->status->value : (string) $this->status,
        ];
    }
}
