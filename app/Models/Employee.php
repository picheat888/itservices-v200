<?php

namespace App\Models;

use App\Enums\EmployeeStatus;
use App\Models\GroupRole;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

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

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }
}
