<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserRole;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Support\Permissions;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     * NOTE: 'role' is kept here so factory/seeder assignments like ['role' => 'super']
     * are intercepted by setRoleAttribute() and resolved to role_id — it is never
     * persisted as a literal column value.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'username',
        'password',
        'password_changed_at',
        'must_change_password',
        'role',
        'role_id',
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
            'must_change_password' => 'boolean',
            'password' => 'hashed',
            'preferences' => 'array',
        ];
    }

    /**
     * The role assigned to this user (resolved via role_id FK).
     * Use $user->role?->key to get the role key string.
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Read-accessor: ensures $user->role always returns the Role *model* (via
     * role_id FK) and not the legacy `role` string column that still exists in the
     * schema during this transitional migration phase. The string column is dropped
     * in a later task. Access the key via $user->role?->key.
     */
    public function getRoleAttribute(): ?Role
    {
        return $this->getRelationValue('role');
    }

    /**
     * Compatibility write-mutator: assigning a role *key* (string) resolves it to
     * role_id, so existing code/tests/seeders can keep passing role => '<key>'.
     * firstOrCreate ensures tests that haven't seeded the role still work; in production
     * the role always already exists. Never persists a literal `role` column.
     */
    public function setRoleAttribute(?string $key): void
    {
        $this->attributes['role_id'] = $key === null
            ? null
            : Role::firstOrCreate(
                ['key' => $key],
                ['name' => ucfirst($key), 'color' => '#64748b', 'is_system' => UserRole::isSuperKey($key)],
            )->id;
        unset($this->attributes['role']);
    }

    /**
     * Check whether the user has one of the given role keys.
     */
    public function hasRole(string ...$keys): bool
    {
        return in_array($this->role?->key, $keys, true);
    }

    /**
     * Returns true when this user holds the all-access role.
     */
    public function isSuper(): bool
    {
        return UserRole::isSuperKey($this->role?->key);
    }

    // Super admin and HR can manage the employee directory.
    public function canManageEmployees(): bool
    {
        return $this->hasRole(UserRole::SuperAdmin->value, UserRole::HR->value);
    }

    // Only super admin can manage positions and departments (org structure).
    public function canManageOrg(): bool
    {
        return $this->isSuper();
    }

    /**
     * Human-readable label for the user's role, falling back to the key.
     */
    public function roleLabel(): string
    {
        return $this->role?->name ?? (string) ($this->role?->key ?? '');
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
            ->where('role_id', $this->role_id)
            ->where('allowed', true)
            ->pluck('permission')
            ->all();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->isSuper() || in_array($permission, $this->permissions(), true);
    }

    /** How long before the expiry the account starts being warned at sign-in. */
    public const PASSWORD_EXPIRY_WARNING_DAYS = 14;

    /**
     * Days left before the expiry policy locks this account out, or null when
     * there is no deadline to count towards — the policy is off, or the password
     * has never been set and counts as expired rather than as having a countdown.
     *
     * Negative once the deadline has passed, so a caller can tell "due today" from
     * "overdue"; isPasswordExpired() below is the question most callers want.
     */
    public function passwordDaysRemaining(): ?int
    {
        $days = (int) AppSetting::get('password_expiry_days', '0');

        if ($days <= 0 || $this->password_changed_at === null) {
            return null;
        }

        // Whole days between now and the deadline, counted the way a person would:
        // a deadline later today is 0 days left, not a fraction of one.
        return (int) now()->startOfDay()->diffInDays($this->password_changed_at->copy()->addDays($days)->startOfDay(), false);
    }

    /**
     * Sign the account out everywhere — after its password is reset or changed.
     *
     * Laravel keeps only the user id in the session, and a "remember me" cookie carries a
     * token that outlives any session, so a new password alone leaves every other device
     * signed in. That matters because the usual reason to change a password is a suspected
     * takeover. Ends every session (but $keepSessionId — the device making the change),
     * every API token, and every remember cookie, by rotating the token they must match.
     */
    public function signOutEverywhere(?string $keepSessionId = null): void
    {
        // Keyed off the table rather than the configured driver so the behaviour is the same
        // everywhere it is stored — and testable. (Sessions held outside the database, e.g.
        // in Redis, would need their own eviction; this app stores them here.)
        $table = config('session.table', 'sessions');
        if (Schema::hasTable($table)) {
            DB::table($table)
                ->where('user_id', $this->id)
                ->when($keepSessionId !== null, fn ($q) => $q->where('id', '!=', $keepSessionId))
                ->delete();
        }

        // API tokens, for any client that authenticates with one instead of a cookie.
        $this->tokens()->delete();

        $this->setRememberToken(Str::random(60));
        $this->saveQuietly();
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
     * Backwards-compatible accessor for the linked employee. Delegates to the
     * employee() FK relation. Null for system-only accounts.
     */
    public function linkedEmployee(): ?Employee
    {
        return $this->employee;
    }

    /** Resolves the profile photo URL from the linked Employee record. */
    public function employeePhotoUrl(): ?string
    {
        return $this->linkedEmployee()?->photo_url;
    }
}
