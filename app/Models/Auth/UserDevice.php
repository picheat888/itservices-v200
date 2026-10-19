<?php

namespace App\Models\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Carbon\CarbonInterface;
use Database\Factories\UserDeviceFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// One browser sign-in of an account; counted against the device limit while it is active.
class UserDevice extends Model
{
    /** @use HasFactory<UserDeviceFactory> */
    use HasFactory;

    public $timestamps = false;

    protected static function newFactory(): UserDeviceFactory
    {
        return UserDeviceFactory::new();
    }

    protected $fillable = [
        'user_id', 'session_id', 'remember_token_hash', 'remember_expires_at', 'ip', 'location',
        'os', 'browser', 'user_agent', 'signed_in_at', 'last_active_at', 'ended_at', 'end_reason', 'ended_by',
    ];

    protected $hidden = ['remember_token_hash'];

    /** @return array<string, mixed> */
    protected function casts(): array
    {
        return [
            'remember_expires_at' => 'datetime',
            'signed_in_at' => 'datetime',
            'last_active_at' => 'datetime',
            'ended_at' => 'datetime',
            'end_reason' => DeviceEndReason::class,
            'ended_by' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Devices not ended and not expired at $now: remembered ones until their remember expiry,
     * the rest while the last activity is inside the lifetime.
     *
     * @param  Builder<UserDevice>  $query
     * @return Builder<UserDevice>
     */
    public function scopeActive(Builder $query, ?CarbonInterface $now = null): Builder
    {
        $now ??= now();

        return $query->whereNull('ended_at')->where(function (Builder $device) use ($now) {
            $device->where('remember_expires_at', '>', $now)
                ->orWhere(fn (Builder $plain) => $plain
                    ->whereNull('remember_expires_at')
                    ->where('last_active_at', '>=', $now->copy()->subMinutes(self::lifetimeMinutes())));
        });
    }

    /**
     * Devices ended or expired at $now: exactly the ones active() leaves out.
     *
     * @param  Builder<UserDevice>  $query
     * @return Builder<UserDevice>
     */
    public function scopeInactive(Builder $query, ?CarbonInterface $now = null): Builder
    {
        $now ??= now();

        return $query->where(fn (Builder $device) => $device
            ->whereNotNull('ended_at')
            ->orWhere('remember_expires_at', '<=', $now)
            ->orWhere(fn (Builder $plain) => $plain
                ->whereNull('remember_expires_at')
                ->where('last_active_at', '<', $now->copy()->subMinutes(self::lifetimeMinutes()))));
    }

    /** Minutes a device without remember-me stays active: the idle timeout when on, never more than the session lifetime. */
    public static function lifetimeMinutes(): int
    {
        $sessionLifetime = (int) config('session.lifetime');
        $idleTimeout = (int) AppSetting::get('session_timeout_minutes', '0');

        return $idleTimeout > 0 ? min($idleTimeout, $sessionLifetime) : $sessionLifetime;
    }
}
