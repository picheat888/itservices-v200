<?php

namespace App\Models\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// One append-only row of the login log; created_at only, never updated.
class LoginEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'login_name', 'event', 'reason', 'remembered', 'device_id',
        'ip', 'location', 'os', 'browser', 'created_at',
    ];

    /** @return array<string, mixed> */
    protected function casts(): array
    {
        return [
            'event' => LoginEventType::class,
            'reason' => DeviceEndReason::class,
            'remembered' => 'boolean',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<UserDevice, $this> */
    public function device(): BelongsTo
    {
        return $this->belongsTo(UserDevice::class, 'device_id');
    }
}
