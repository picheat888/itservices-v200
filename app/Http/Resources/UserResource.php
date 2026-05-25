<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Profile fields (photo/phone/name_th) come from the linked Employee record.
        $employee = $this->linkedEmployee();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'username' => $this->username,
            'role' => (string) $this->role,
            'role_label' => $this->roleLabel(),
            // The Role Group that grants this user's permission level. A user may
            // belong to several groups (e.g. "All Staff" plus "IT Team"); the one
            // that actually sets their role is the group whose role matches, so we
            // prefer that. Fall back to any group, then null for system accounts.
            'group_name' => $this->resolveGroupName($employee),
            'employee_id' => $employee?->id,
            'photo_url' => $employee && $employee->photo_path ? Storage::disk('public')->url($employee->photo_path) : null,
            'phone' => $employee?->phone,
            'name_th' => $employee?->name_th,
            'permissions' => $this->permissions(),
            'preferences' => $this->resolvedPreferences(),
            'email_verified_at' => $this->email_verified_at,
        ];
    }

    /**
     * Resolves the name of the Role Group that grants this user's permission
     * level. Prefers the group whose role matches the user's current role;
     * otherwise returns the first group, or null when there is no linked group.
     */
    private function resolveGroupName(?\App\Models\Employee $employee): ?string
    {
        if (! $employee) {
            return null;
        }

        $groups = $employee->groupRoles()->get();

        return $groups->firstWhere('role', $this->role)?->name
            ?? $groups->first()?->name;
    }
}
