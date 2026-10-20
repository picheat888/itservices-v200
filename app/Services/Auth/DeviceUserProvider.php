<?php

// User provider for remember-me per device: a cookie token is matched against active user_devices rows
// and never written to users.remember_token.

namespace App\Services\Auth;

use App\Models\Auth\UserDevice;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use SensitiveParameter;

class DeviceUserProvider extends EloquentUserProvider
{
    public function retrieveByToken($identifier, #[SensitiveParameter] $token): ?Authenticatable
    {
        $hash = DeviceService::rememberTokenHash((string) $token);
        $device = UserDevice::query()
            ->active()
            ->where('user_id', $identifier)
            ->where('remember_token_hash', $hash)
            ->first() ?? $this->rotatedAway($identifier, $hash);

        // Legacy cookie from before devices: matches users.remember_token only
        if ($device === null) {
            return parent::retrieveByToken($identifier, $token);
        }

        $user = $this->retrieveById($identifier);
        if ($user === null) {
            return null;
        }

        $user->setRememberToken($token);
        $this->keepOutOfUsersTable($user);
        app(CurrentDevice::class)->set($device);

        return $user;
    }

    public function updateRememberToken(Authenticatable $user, #[SensitiveParameter] $token): void
    {
        $this->keepOutOfUsersTable($user);

        app(CurrentDevice::class)->get()?->forceFill(['remember_token_hash' => null])->save();
    }

    /** A token replaced moments ago (DeviceService::rotateRememberToken) still finds its device, for requests sent alongside the one that replaced it. */
    private function rotatedAway(mixed $identifier, string $hash): ?UserDevice
    {
        $deviceId = Cache::get(DeviceService::rotatedTokenCacheKey($hash));

        return $deviceId === null ? null : UserDevice::query()->active()->where('user_id', $identifier)->find($deviceId);
    }

    // An in-memory token is never dirty, so no later save() writes it to users.remember_token
    private function keepOutOfUsersTable(Authenticatable $user): void
    {
        if ($user instanceof Model) {
            $user->syncOriginalAttribute($user->getRememberTokenName());
        }
    }
}
