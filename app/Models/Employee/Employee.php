<?php

namespace App\Models\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Permission\GroupRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Employee extends Model
{
    protected $fillable = [
        'code', 'first_name', 'last_name', 'first_name_th', 'last_name_th', 'photo_path',
        'department_id', 'section_id', 'position_id',
        'manager_id', 'email', 'phone', 'username',
        'joined_at', 'status', 'resign_reason', 'last_day',
    ];

    /** Composed full name (EN) for display — first + last. */
    public function getNameAttribute(): string
    {
        return trim(($this->first_name ?? '').' '.($this->last_name ?? ''));
    }

    /** Composed full Thai name for display, or null when no Thai name is set. */
    public function getNameThAttribute(): ?string
    {
        $th = trim(($this->first_name_th ?? '').' '.($this->last_name_th ?? ''));

        return $th !== '' ? $th : null;
    }

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

    /** The section (หน่วยงาน) this employee belongs to, or null if unassigned. */
    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    /** This employee's direct manager (null at the top of the tree). */
    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    /** Employees who report directly to this one. */
    public function subordinates(): HasMany
    {
        return $this->hasMany(Employee::class, 'manager_id');
    }

    /**
     * True when $other sits somewhere below this employee in the reporting tree
     * (used to reject a manager assignment that would create a cycle). Walks up
     * from $other; a repeat id ends the walk defensively.
     */
    public function isAncestorOf(Employee $other): bool
    {
        $seen = [];
        $current = $other->manager;
        while ($current !== null && ! in_array($current->id, $seen, true)) {
            if ($current->id === $this->id) {
                return true;
            }
            $seen[] = $current->id;
            $current = $current->manager;
        }

        return false;
    }
}
