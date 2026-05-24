<?php

namespace App\Http\Resources;

use App\Enums\EmployeeStatus;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin \App\Models\Employee */
class EmployeeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $status = $this->status instanceof EmployeeStatus ? $this->status : EmployeeStatus::tryFrom((string) $this->status);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'photo_url' => $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null,
            'department_id' => $this->department_id,
            'position_id' => $this->position_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'department_th' => $this->whenLoaded('department', fn () => $this->department?->name_th),
            'position' => $this->whenLoaded('position', fn () => $this->position?->title),
            'email' => $this->email,
            'phone' => $this->phone,
            'login_method' => $this->login_method,
            'username' => $this->username,
            'joined_at' => $this->joined_at?->toDateString(),
            'status' => $status?->value ?? EmployeeStatus::Active->value,
            'resign_reason' => $this->resign_reason,
            'last_day' => $this->last_day?->toDateString(),
            'has_account' => User::where('email', $this->email)
                ->orWhere(function ($q) {
                    if ($this->username) {
                        $q->where('username', $this->username);
                    }
                })
                ->exists(),
        ];
    }
}
