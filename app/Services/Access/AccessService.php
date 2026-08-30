<?php

namespace App\Services\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Support\EmailTable;
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
     * How much access a departed employee still holds: grants left switched on plus resources
     * they still own. The same two things the Access overview counts, so an offboarding notice
     * and the governance card can never disagree about how much is outstanding.
     *
     * @return array{grants: int, owned: int, total: int}
     */
    public function outstandingFor(Employee $employee): array
    {
        $grants = AccessMembership::query()->active()->where('employee_id', $employee->id)->count();
        $owned = EmailGroup::where('owner_employee_id', $employee->id)->count()
            + FileShare::where('owner_employee_id', $employee->id)->count();

        return ['grants' => $grants, 'owned' => $owned, 'total' => $grants + $owned];
    }

    /**
     * Everything outstandingFor() counts, written out as the one table an offboarding email
     * carries — because a count alone ("5 access items") tells the reader there is work
     * without telling them what it is.
     *
     * One list, not two. Being a member and being the owner do call for different things
     * done to them, but that difference is a word in the "Held as" column, and splitting the
     * mail into two tables made the reader check two places to answer "what does this person
     * still have". Grants first, owners after, so the rows that are simply revoked are not
     * interleaved with the ones that need somebody found.
     *
     * Kept here rather than in the sender: naming a resource means knowing which of the four
     * registries it came from, which is this service's knowledge and nobody else's.
     */
    public function outstandingTableFor(Employee $employee): string
    {
        $rows = AccessMembership::query()->active()
            ->with('resource')
            ->where('employee_id', $employee->id)
            ->get()
            ->map(fn (AccessMembership $m) => $this->accessRow($m->resource, $m->resource_type, $this->heldAs($m)))
            ->concat(
                EmailGroup::where('owner_employee_id', $employee->id)->get()
                    ->map(fn (EmailGroup $g) => $this->accessRow($g, 'email_group', 'Owner'))
            )
            ->concat(
                FileShare::where('owner_employee_id', $employee->id)->get()
                    ->map(fn (FileShare $share) => $this->accessRow($share, 'file_share', 'Owner'))
            );

        return EmailTable::render(self::ACCESS_HEADERS, $rows->values()->all(), [], self::ACCESS_WIDTHS, self::ACCESS_WRAP);
    }

    /** What each registry is called in a message to a person. */
    private const TYPE_LABELS = [
        'email_group' => 'Email group',
        'file_share' => 'File share',
        'social_platform' => 'Social platform',
        'software' => 'Software',
    ];

    /**
     * The column holding a resource's address — the value somebody clearing the access
     * actually searches for at the other end. Software has none: a seat is identified by the
     * product, which is already the name.
     */
    private const ADDRESS_COLUMNS = [
        'email_group' => 'email',
        'file_share' => 'path',
        'social_platform' => 'url',
    ];

    /**
     * What a stored level is called on screen. "Write" grants read as well as write, and the
     * Access Directory has always shown it as "Read/Write" — the mail says the same thing,
     * or it looks like a different level from the one in the app.
     */
    private const LEVEL_LABELS = ['Read' => 'Read', 'Write' => 'Read/Write'];

    public const ACCESS_HEADERS = ['Code', 'Type', 'Name', 'Resource', 'Held as'];

    public const ACCESS_WIDTHS = ['12%', '15%', '25%', '32%', '16%'];

    /** Name and Resource: the two columns carrying a long value with nowhere natural to break. */
    public const ACCESS_WRAP = [2, 3];

    /**
     * How the access is held, in the terms the Access Directory itself uses.
     *
     * Only file shares grade access (Read / Read-Write) and only email groups and file shares
     * have an owner; a social or software membership carries no level at all, so the honest
     * answer for those is simply that they are a member. A blank cell here would read as
     * missing data in the one column that says what has to be done to the row.
     */
    private function heldAs(AccessMembership $membership): string
    {
        $level = (string) $membership->access_level;

        return $level === '' ? 'Member' : (self::LEVEL_LABELS[$level] ?? $level);
    }

    /**
     * One row of the table.
     *
     * Every cell through text(): names and paths are typed by hand, so an ampersand or a
     * stray angle bracket would otherwise reach the message as markup.
     *
     * @return list<string>
     */
    private function accessRow(?Model $resource, string $morphKey, string $heldAs): array
    {
        $addressColumn = self::ADDRESS_COLUMNS[$morphKey] ?? null;
        $address = $addressColumn === null ? null : $resource?->getAttribute($addressColumn);

        return [
            EmailTable::text((string) ($resource?->code ?? '-'), 20),
            EmailTable::text(self::TYPE_LABELS[$morphKey] ?? $morphKey),
            EmailTable::text((string) ($resource?->name ?? '(deleted resource)'), 40),
            EmailTable::text(filled($address) ? (string) $address : '-', 48),
            EmailTable::text($heldAs, 24),
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

        // Governance hygiene, with per-item detail lists so each status row can
        // open a drill-down: resources (of any kind) with no active member,
        // resources missing an owner, and resigned employees still holding a grant.
        $kinds = [
            ['model' => EmailGroup::class, 'kind' => 'email-groups'],
            ['model' => FileShare::class, 'kind' => 'file-shares'],
            ['model' => SocialPlatform::class, 'kind' => 'social-platforms'],
            ['model' => Software::class, 'kind' => 'software'],
        ];

        // No active member — checked across all four registries.
        $emptyList = collect($kinds)->flatMap(fn (array $c) => $c['model']::query()
            ->whereDoesntHave('memberships', fn ($q) => $q->active())
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($m) => ['kind' => $c['kind'], 'id' => $m->id, 'name' => $m->name]))->values();

        // Missing owner — only email groups and file shares carry an owner.
        $noOwnerList = FileShare::whereNull('owner_employee_id')->orderBy('name')->get(['id', 'name'])
            ->map(fn ($s) => ['kind' => 'file-shares', 'id' => $s->id, 'name' => $s->name])
            ->concat(EmailGroup::whereNull('owner_employee_id')->orderBy('name')->get(['id', 'name'])
                ->map(fn ($g) => ['kind' => 'email-groups', 'id' => $g->id, 'name' => $g->name]))
            ->values();

        // Active grants still held by resigned employees — one row per grant so the
        // drill-down shows who holds what.
        $resignedGrants = AccessMembership::query()->active()
            ->whereHas('employee', fn ($q) => $q->where('status', 'resigned'))
            ->with(['employee', 'resource'])->get();
        $kindByType = [
            'email_group' => 'email-groups', 'file_share' => 'file-shares',
            'social_platform' => 'social-platforms', 'software' => 'software',
        ];
        // Sorted by person, then by resource: a work queue that reshuffles between visits is
        // one you cannot work down. The query itself has no ORDER BY, so the order was
        // whatever the database happened to return.
        $resignedList = $resignedGrants->map(fn (AccessMembership $m) => [
            'kind' => $kindByType[$m->resource_type] ?? 'software',
            'id' => $m->resource_id,
            // The grant's own id, so the drill-down can revoke it in place through the
            // registry's existing endpoint — which keeps that registry's edit permission
            // in the loop instead of inventing a gate-free shortcut.
            'membership_id' => $m->id,
            'name' => $m->resource?->name,
            'employee' => $m->employee?->name,
        ])->sortBy([['employee', 'asc'], ['name', 'asc']])->values();

        // Resources still OWNED by someone who has left. Ownership is not a membership row,
        // so this never surfaced anywhere — yet the resource has a named custodian who is
        // gone, which is the same problem as having no owner at all and takes the same
        // remedy, so it joins the ownerless list rather than the revoke queue.
        $ownerResigned = fn ($q) => $q->where('status', 'resigned');
        $resignedOwned = FileShare::whereHas('owner', $ownerResigned)->with('owner')->orderBy('name')->get()
            ->map(fn (FileShare $s) => [
                'kind' => 'file-shares', 'id' => $s->id, 'name' => $s->name,
                'employee' => $s->owner?->name, 'reason' => 'resigned',
            ])
            ->concat(EmailGroup::whereHas('owner', $ownerResigned)->with('owner')->orderBy('name')->get()
                ->map(fn (EmailGroup $g) => [
                    'kind' => 'email-groups', 'id' => $g->id, 'name' => $g->name,
                    'employee' => $g->owner?->name, 'reason' => 'resigned',
                ]))
            ->values();

        // Ownership gaps are one job with one remedy — find a custodian — whether the
        // resource never had an owner or its owner has left. They travel as one list with a
        // reason on each row so the drill-down can still tell them apart; the ones with a
        // name to hand over from come first.
        $ownerlessIssues = $resignedOwned->concat(
            $noOwnerList->map(fn (array $row) => $row + ['employee' => null, 'reason' => 'none'])
        )->values();

        return [
            'channels' => $channels,
            'total_grants' => (int) array_sum(array_column($channels, 'grants')),
            'governance' => [
                'empty_resources' => $emptyList->count(),
                'empty_sample' => $emptyList->first()['name'] ?? null,
                'no_owner' => $ownerlessIssues->count(),
                'owners_complete' => $ownerlessIssues->isEmpty(),
                // Counts the rows the drill-down actually lists, not the distinct people
                // behind them — the card said 1 while the list showed 3 because one is a
                // headcount and the other a work queue. Every other row on this card counts
                // items to fix, so this one does too.
                'resigned_holders' => $resignedList->count(),
                'added_30d' => (int) AccessMembership::query()->active()->where('created_at', '>=', $since)->count(),
                'issues' => [
                    'empty' => $emptyList,
                    'no_owner' => $ownerlessIssues,
                    'resigned' => $resignedList,
                ],
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
