<?php

namespace App\Services\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
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
        // The owner already has the resource (email groups / file shares) — don't also make them a member.
        $owner = $resource->getAttribute('owner_employee_id');
        if ($owner !== null && (int) $owner === $employeeId) {
            throw ValidationException::withMessages(['employee_id' => 'This employee already owns the resource.']);
        }

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
     * Set (or clear) a resource's owner. Owner and member are mutually exclusive:
     *  - the incoming owner's active membership (if any) is soft-revoked, and
     *  - the replaced owner is demoted to a plain member so they keep access rather
     *    than vanishing from the resource entirely.
     */
    public function setOwner(Model $resource, ?int $ownerEmployeeId): void
    {
        $previousOwnerId = $resource->getAttribute('owner_employee_id');
        $previousOwnerId = $previousOwnerId !== null ? (int) $previousOwnerId : null;

        $resource->update(['owner_employee_id' => $ownerEmployeeId]);

        if ($ownerEmployeeId !== null) {
            $resource->memberships()->active()->where('employee_id', $ownerEmployeeId)
                ->update(['revoked_at' => now()->toDateString()]);
        }

        // Demote the replaced owner to a member (skip if it's the same person, or already a member).
        if ($previousOwnerId !== null && $previousOwnerId !== $ownerEmployeeId
            && ! $resource->memberships()->active()->where('employee_id', $previousOwnerId)->exists()) {
            $resource->memberships()->create([
                'employee_id' => $previousOwnerId,
                'access_level' => $resource instanceof FileShare ? 'Read' : null,
                'granted_at' => now()->toDateString(),
                'granted_by' => auth()->user()?->id,
            ]);
        }
    }

    /**
     * Active memberships for an employee grouped by resource type, eager-loaded.
     * Email groups + file shares the employee OWNS (approver / share owner) are folded
     * in too — the owner is stored on the resource, not as a membership, so an owner who
     * isn't also a member would otherwise be missing from their access list.
     *
     * @return array{email_group: Collection, file_share: Collection, social_platform: Collection, software: Collection}
     */
    public function employeeAccess(Employee $employee): array
    {
        $all = AccessMembership::query()->active()
            ->where('employee_id', $employee->id)
            ->with(['resource' => fn ($morphTo) => $morphTo->morphWith([Software::class => ['brand']])])
            ->get();

        $emailMemberships = $all->where('resource_type', 'email_group')->values();
        $fileMemberships = $all->where('resource_type', 'file_share')->values();

        // Owned resources the employee isn't already a member of → synthetic owner rows.
        $ownedEmail = EmailGroup::where('owner_employee_id', $employee->id)
            ->whereNotIn('id', $emailMemberships->pluck('resource_id'))->get();
        $ownedFile = FileShare::where('owner_employee_id', $employee->id)
            ->whereNotIn('id', $fileMemberships->pluck('resource_id'))->get();

        return [
            'email_group' => $emailMemberships->concat($ownedEmail->map($this->ownerRow(...)))->values(),
            'file_share' => $fileMemberships->concat($ownedFile->map($this->ownerRow(...)))->values(),
            'social_platform' => $all->where('resource_type', 'social_platform')->values(),
            'software' => $all->where('resource_type', 'software')->values(),
        ];
    }

    /**
     * Wrap an owned resource in a membership-shaped row (no access level, negative id
     * so it never collides with a real membership id used as the list key).
     */
    private function ownerRow(Model $resource): AccessMembership
    {
        $m = new AccessMembership;
        $m->id = -$resource->id;
        $m->resource_id = $resource->id;
        $m->access_level = null;
        $m->purpose = null;
        $m->granted_at = null;
        $m->setRelation('resource', $resource);

        return $m;
    }
}
