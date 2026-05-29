<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserRole;
use App\Support\Permissions;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'username',
        'password',
        'password_changed_at',
        'role',
        'preferences',
        'employee_id',
    ];

    /** Default per-user display preferences. */
    public const DEFAULT_PREFERENCES = [
        'dark' => false,
        'lang' => 'en',
        'density' => 'normal',
        'radius' => 10,
        'sidebar' => 'labeled',
        'accent' => '#2563eb',
    ];

    /**
     * @return array<string, mixed>
     */
    public function resolvedPreferences(): array
    {
        return array_merge(self::DEFAULT_PREFERENCES, $this->preferences ?? []);
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'password' => 'hashed',
            // role is a plain string key into the `roles` table (super/admin/hr/user or custom)
            'preferences' => 'array',
        ];
    }

    public function hasRole(string ...$keys): bool
    {
        return in_array($this->role, $keys, true);
    }

    public function isSuper(): bool
    {
        return $this->role === 'super';
    }

    // Super admin and HR can manage the employee directory.
    public function canManageEmployees(): bool
    {
        return $this->hasRole('super', 'hr');
    }

    // Only super admin can manage positions and departments (org structure).
    public function canManageOrg(): bool
    {
        return $this->isSuper();
    }

    public function roleLabel(): string
    {
        return Role::where('key', $this->role)->value('name')
            ?? UserRole::tryFrom((string) $this->role)?->label()
            ?? (string) $this->role;
    }

    /**
     * Resolved permission keys for this user (super = all).
     *
     * @return list<string>
     */
    public function permissions(): array
    {
        if ($this->isSuper()) {
            return Permissions::all();
        }

        return RolePermission::query()
            ->where('role', $this->role)
            ->where('allowed', true)
            ->pluck('permission')
            ->all();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->isSuper() || in_array($permission, $this->permissions(), true);
    }

    /**
     * Whether this account's password has exceeded the configured expiry window.
     * Returns false when the policy is disabled (password_expiry_days <= 0).
     * A null password_changed_at is treated as expired while the policy is on,
     * forcing a first-time change.
     */
    public function isPasswordExpired(): bool
    {
        $days = (int) AppSetting::get('password_expiry_days', '0');

        if ($days <= 0) {
            return false;
        }

        $changedAt = $this->password_changed_at;

        return $changedAt === null || $changedAt->addDays($days)->isPast();
    }

    /** The employee this login account belongs to (null for system-only accounts). */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * The Employee record this login account belongs to, matched by email or
     * username (the same link used by has_account). Null for system-only accounts.
     */
    public function linkedEmployee(): ?Employee
    {
        return $this->employee;
    }

    /** Resolves the profile photo URL from the linked Employee record. */
    public function employeePhotoUrl(): ?string
    {
        $employee = $this->linkedEmployee();

        return $employee && $employee->photo_path
            ? Storage::disk('public')->url($employee->photo_path)
            : null;
    }
}
