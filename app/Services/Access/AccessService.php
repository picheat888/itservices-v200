<?php

namespace App\Services\Access;

use App\Models\Access\AccessMembership;
use App\Models\Employee\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class AccessService
{
    /**
     * Grant an employee access to a resource. Rejects a second ACTIVE grant for
     * the same (resource, employee). Returns the membership.
     *
     * @param  array{access_level?: string|null, purpose?: string|null, granted_at?: string|null}  $attrs
     */
    public function grant(Model $resource, int $employeeId, array $attrs): AccessMembership
    {
        $exists = $resource->memberships()->active()->where('employee_id', $employeeId)->exists();
        if ($exists) {
            throw ValidationException::withMessages(['employee_id' => 'This employee already has active access to the resource.']);
        }

        return $resource->memberships()->create([
            'employee_id' => $employeeId,
            'access_level' => $attrs['access_level'] ?? null,
            'purpose' => $attrs['purpose'] ?? null,
            'granted_at' => $attrs['granted_at'] ?? now()->toDateString(),
            'granted_by' => auth()->user()?->id,
        ]);
    }

    /** Soft-revoke (idempotent). */
    public function revoke(AccessMembership $membership): AccessMembership
    {
        if (! $membership->revoked_at) {
            $membership->update(['revoked_at' => now()->toDateString()]);
        }

        return $membership;
    }

    /**
     * Active memberships for an employee grouped by resource type, eager-loaded.
     *
     * @return array{email_group: Collection, file_share: Collection, social_platform: Collection}
     */
    public function employeeAccess(Employee $employee): array
    {
        $all = AccessMembership::query()->active()
            ->where('employee_id', $employee->id)
            ->with('resource')
            ->get();

        return [
            'email_group' => $all->where('resource_type', 'email_group')->values(),
            'file_share' => $all->where('resource_type', 'file_share')->values(),
            'social_platform' => $all->where('resource_type', 'social_platform')->values(),
        ];
    }
}
