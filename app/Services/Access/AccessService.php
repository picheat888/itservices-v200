<?php

namespace App\Services\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
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
     * Aggregate figures for the Access Directory "overview" tab: per-channel
     * counts (resources / active grants / grants added in the last 30 days), the
     * active-grant distribution total, a handful of governance-hygiene checks,
     * and the most-reached resources. Returned as a plain array (rendered as-is).
     *
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $since = now()->subDays(30)->startOfDay();

        // Active grants by morph type, plus the last-30-day churn (grants issued vs
        // revoked in the window) so the UI can show a signed net change per channel.
        $activeByType = AccessMembership::query()->active()
            ->selectRaw('resource_type, COUNT(*) as c')->groupBy('resource_type')->pluck('c', 'resource_type');
        $createdByType = AccessMembership::query()->where('created_at', '>=', $since)
            ->selectRaw('resource_type, COUNT(*) as c')->groupBy('resource_type')->pluck('c', 'resource_type');
        $revokedByType = AccessMembership::query()->whereNotNull('revoked_at')->where('revoked_at', '>=', $since)
            ->selectRaw('resource_type, COUNT(*) as c')->groupBy('resource_type')->pluck('c', 'resource_type');

        $stat = fn (string $model, string $type): array => [
            'resources' => (int) $model::count(),
            'grants' => (int) ($activeByType[$type] ?? 0),
            // Net change in the last 30 days: positive = grew, negative = shrank.
            'net_30d' => (int) ($createdByType[$type] ?? 0) - (int) ($revokedByType[$type] ?? 0),
        ];

        $channels = [
            'email_groups' => $stat(EmailGroup::class, 'email_group'),
            'file_shares' => $stat(FileShare::class, 'file_share'),
            'social' => $stat(SocialPlatform::class, 'social_platform'),
            'software' => $stat(Software::class, 'software'),
        ];

        // Governance hygiene: file shares with no active member, resources missing
        // an owner, and resigned employees who still hold an active grant.
        $emptyShares = FileShare::query()->whereDoesntHave('memberships', fn ($q) => $q->active())->get(['id', 'name']);
        $sharesNoOwner = FileShare::whereNull('owner_employee_id')->count();
        $groupsNoOwner = EmailGroup::whereNull('owner_employee_id')->count();
        $resignedHolders = AccessMembership::query()->active()
            ->whereHas('employee', fn ($q) => $q->where('status', 'resigned'))
            ->distinct('employee_id')->count('employee_id');

        return [
            'channels' => $channels,
            'total_grants' => (int) array_sum(array_column($channels, 'grants')),
            'governance' => [
                'empty_shares' => $emptyShares->count(),
                'empty_shares_sample' => $emptyShares->first()?->name,
                'shares_without_owner' => $sharesNoOwner,
                'groups_without_owner' => $groupsNoOwner,
                'owners_complete' => $sharesNoOwner === 0 && $groupsNoOwner === 0,
                'resigned_holders' => $resignedHolders,
                'added_30d' => (int) AccessMembership::query()->active()->where('created_at', '>=', $since)->count(),
            ],
            'top_resources' => $this->topResources(6),
        ];
    }

    /**
     * The most-reached resources across all four types, ranked by active-grant
     * count. Each row carries the front-end tab key (for linking) plus a type-
     * appropriate detail line: email / path / url, or the publisher for software.
     *
     * @return array<int, array{id: int, name: string, detail: string|null, logo: string|null, kind: string, grants: int}>
     */
    private function topResources(int $limit): array
    {
        $activeCount = ['memberships as grants' => fn ($q) => $q->active()];
        $rows = collect();

        EmailGroup::query()->withCount($activeCount)->get(['id', 'name', 'email'])
            ->each(fn ($r) => $rows->push(['id' => $r->id, 'name' => $r->name, 'detail' => $r->email, 'logo' => null, 'kind' => 'email-groups', 'grants' => (int) $r->grants]));

        FileShare::query()->withCount($activeCount)->get(['id', 'name', 'path'])
            ->each(fn ($r) => $rows->push(['id' => $r->id, 'name' => $r->name, 'detail' => $r->path, 'logo' => null, 'kind' => 'file-shares', 'grants' => (int) $r->grants]));

        SocialPlatform::query()->withCount($activeCount)->get(['id', 'name', 'url', 'logo_path'])
            ->each(fn ($r) => $rows->push(['id' => $r->id, 'name' => $r->name, 'detail' => $r->url, 'logo' => $r->logo_url, 'kind' => 'social-platforms', 'grants' => (int) $r->grants]));

        Software::query()->with('brand')->withCount($activeCount)->get(['id', 'name', 'brand_id', 'logo_path'])
            ->each(fn ($r) => $rows->push(['id' => $r->id, 'name' => $r->name, 'detail' => $r->brand?->name, 'logo' => $r->logo_url, 'kind' => 'software', 'grants' => (int) $r->grants]));

        return $rows->sortByDesc('grants')->take($limit)->values()->all();
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
