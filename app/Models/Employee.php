<?php

namespace App\Models;

use App\Enums\EmployeeStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Employee extends Model
{
    protected $fillable = [
        'code', 'name', 'name_th', 'photo_path', 'department_id', 'position_id',
        'email', 'phone', 'login_method', 'username',
        'joined_at', 'status', 'resign_reason', 'last_day',
    ];

    protected function casts(): array
    {
        return [
            'joined_at' => 'date',
            'last_day' => 'date',
            'status' => EmployeeStatus::class,
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Employee $employee) {
            if (blank($employee->code)) {
                $next = (static::max('id') ?? 1040) + 1;
                $employee->code = 'EMP-'.$next;
            }
        });
    }

    public function groupRoles(): BelongsToMany
    {
        return $this->belongsToMany(GroupRole::class, 'group_role_employee');
    }

    /** The login account linked to this employee, or null if none. */
    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    /**
     * Backwards-compatible accessor for the linked login account. Delegates to
     * the user() FK relation. Null for employees with no system account.
     */
    public function linkedUser(): ?User
    {
        return $this->user;
    }

    /** True when this employee's linked login account holds the super (Administrator) role. */
    public function isSuperAdmin(): bool
    {
        return $this->user?->isSuper() ?? false;
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }
}
