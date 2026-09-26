<?php

namespace App\Models\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Settings\Location;
use App\Models\Settings\RequestOption;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Models\Workflow\Workflow;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An IT service request travelling through its (frozen) approval chain.
 * Named ServiceRequest to avoid colliding with Illuminate\Http\Request.
 */
class ServiceRequest extends Model
{
    protected $fillable = [
        'reference', 'type', 'origin', 'workflow_id', 'auto_ticket',
        'user_id', 'employee_id', 'requester_name', 'department_name',
        // Who pressed Save, which is only a different person for on-behalf origins
        // (HR filing a new employee's onboarding requests).
        'submitted_by_user_id', 'submitted_by_name',
        'title', 'reason', 'fields',
        'status', 'ticket_id',
        // What the request points at — real columns with real foreign keys, so a
        // reference cannot outlive the row it names (see RequestSchemas
        // `referenceColumns`). Cleared to null if that row is ever deleted; the
        // `fields._display` snapshot still holds the label it was submitted with.
        'request_option_id', 'file_share_id', 'email_group_id', 'social_platform_id', 'software_id', 'location_id',
        'approved_at', 'rejected_at', 'fulfilled_at', 'cancelled_at', 'last_activity_at',
    ];

    /**
     * Auto-assign RQ-<YEAR>-<NNNN> when no reference was supplied, counted per
     * year. Reads the max existing reference for the year to find the next
     * sequence (row-locked so concurrent submits cannot collide).
     */
    protected static function booted(): void
    {
        static::creating(function (ServiceRequest $request) {
            if (blank($request->reference)) {
                $year = now()->year;
                $last = static::where('reference', 'like', "RQ-{$year}-%")
                    ->orderByDesc('reference')
                    ->lockForUpdate()
                    ->value('reference');
                $seq = $last ? ((int) substr($last, -4)) + 1 : 1;
                $request->reference = sprintf('RQ-%d-%04d', $year, $seq);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'type' => RequestType::class,
            'origin' => RequestOrigin::class,
            'status' => RequestStatus::class,
            'fields' => 'array',
            'auto_ticket' => 'boolean',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'fulfilled_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workflow, $this> */
    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Employee, $this> */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * The account that filed the request. The same person as `user` for a direct
     * submission; for onboarding it is the HR account, and `user` is null because
     * the new employee has no login yet.
     *
     * @return BelongsTo<User, $this>
     */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by_user_id');
    }

    /** @return BelongsTo<Ticket, $this> */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    // What was asked for. One of these is set per request, decided by its type —
    // answering "which requests want this share / this software?" with a join
    // instead of a scan through json.

    /** @return BelongsTo<RequestOption, $this> */
    public function requestOption(): BelongsTo
    {
        return $this->belongsTo(RequestOption::class);
    }

    /** @return BelongsTo<FileShare, $this> */
    public function fileShare(): BelongsTo
    {
        return $this->belongsTo(FileShare::class);
    }

    /** @return BelongsTo<EmailGroup, $this> */
    public function emailGroup(): BelongsTo
    {
        return $this->belongsTo(EmailGroup::class);
    }

    /** @return BelongsTo<SocialPlatform, $this> */
    public function socialPlatform(): BelongsTo
    {
        return $this->belongsTo(SocialPlatform::class);
    }

    /** @return BelongsTo<Software, $this> */
    public function software(): BelongsTo
    {
        return $this->belongsTo(Software::class);
    }

    /** @return BelongsTo<Location, $this> */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /** @return HasMany<RequestApproval, $this> */
    public function approvals(): HasMany
    {
        return $this->hasMany(RequestApproval::class)->orderBy('position');
    }

    /** @return HasMany<RequestAttachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(RequestAttachment::class);
    }

    /** The single approval row being waited on right now, or null when settled. */
    public function currentApproval(): ?RequestApproval
    {
        return $this->approvals()->where('status', ApprovalStatus::Current->value)->first();
    }

    /**
     * May this account read the request at all? Its participants (owner, the person
     * it is about, whoever filed it, anybody the chain can route to), plus IT and
     * the module's readers. The single answer behind both the detail endpoint and
     * the attachment download route, so a file is never reachable by someone who
     * cannot open the request it belongs to.
     */
    public function isVisibleTo(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        $isParticipant = $user->id === $this->user_id
            || $user->id === $this->submitted_by_user_id
            // The person the request is about — their onboarding predates their account.
            || ($user->employee_id !== null && $user->employee_id === $this->employee_id)
            || ($user->employee_id !== null && $this->approvals()->actionableBy($user->employee)->exists());

        return $isParticipant
            || $user->isSuper()
            || $user->hasPermission('requests.view_all')
            || $user->hasPermission('requests.fulfill');
    }
}
