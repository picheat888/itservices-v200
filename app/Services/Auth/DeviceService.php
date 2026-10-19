<?php

// Starts, reattaches, lists, ends and trims the per-browser device rows that the device limit counts.

namespace App\Services\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class DeviceService
{
    /** Session key holding this session's device id. */
    public const SESSION_KEY = '_device_id';

    private const USER_AGENT_MAX = 300;

    private const REMEMBER_TOKEN_LENGTH = 60;

    private const IPAD_OS = 'iPadOS';

    /** Whether the sessions table exists, asked once per instance (a schema query on MariaDB). */
    private ?bool $hasSessionTable = null;

    public function __construct(
        private readonly LoginEventRecorder $events,
        private readonly CurrentDevice $current,
    ) {}

    /** Cache key of a session's device state; forgotten when the device ends. */
    public static function stateCacheKey(string $sessionId): string
    {
        return 'device-state:'.$sessionId;
    }

    /** Cache key of why a session's device was ended elsewhere, read by the browser still holding that session cookie. */
    public static function endedCacheKey(string $sessionId): string
    {
        return 'device-ended:'.$sessionId;
    }

    /** Cache key of why a remembered device was ended, read by the browser that only has its remember cookie left. */
    public static function endedTokenCacheKey(string $tokenHash): string
    {
        return 'device-ended-token:'.$tokenHash;
    }

    /** How a device remember token is stored on user_devices. */
    public static function rememberTokenHash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** The per-account device limit; 0 = off. */
    public function limit(): int
    {
        return (int) AppSetting::get('device_limit', '0');
    }

    /** A new device remember token, put on $user for the guard's cookie but never saved to users.remember_token. */
    public function issueRememberToken(User $user): string
    {
        $token = Str::random(self::REMEMBER_TOKEN_LENGTH);
        $this->holdRememberTokenInMemory($user, $token);

        return $token;
    }

    public function start(User $user, Request $request, ?string $rememberToken, bool $recordEvent = true): UserDevice
    {
        $now = now();
        $session = $request->hasSession() ? $request->session() : null;
        $remembered = $rememberToken !== null;
        if ($remembered) {
            $this->holdRememberTokenInMemory($user, $rememberToken);
        }

        $device = $user->devices()->create([
            'session_id' => $session?->getId(),
            'remember_token_hash' => $remembered ? self::rememberTokenHash($rememberToken) : null,
            'remember_expires_at' => $remembered ? $this->rememberExpiry() : null,
            ...$this->events->describe($request),
            'user_agent' => $this->userAgentOf($request),
            'signed_in_at' => $now,
            'last_active_at' => $now,
        ]);

        $session?->put(self::SESSION_KEY, $device->id);
        $this->current->set($device);

        if ($recordEvent) {
            $this->events->record(LoginEventType::SignedIn, $user, $request, ['device' => $device, 'remembered' => $remembered]);
        }

        return $device;
    }

    /** After a remember-cookie sign-in: the device moves to the new session and is described afresh. */
    public function reattach(UserDevice $device, Request $request): void
    {
        $device->forceFill([
            'session_id' => $request->session()->getId(),
            ...$this->events->describe($request, touchHint: $device->os === self::IPAD_OS),
            'user_agent' => $this->userAgentOf($request),
            'last_active_at' => now(),
        ])->save();

        $request->session()->put(self::SESSION_KEY, $device->id);
        $this->current->set($device);

        $this->events->record(LoginEventType::SignedIn, $device->user, $request, ['device' => $device, 'remembered' => true]);
    }

    /** A remembered device carries on with a new token and a full remember lifetime, on its new session id. */
    public function rememberAgain(UserDevice $device, string $token, string $sessionId): void
    {
        $previousSessionId = $device->session_id;

        $device->forceFill([
            'session_id' => $sessionId,
            'remember_token_hash' => self::rememberTokenHash($token),
            'remember_expires_at' => $this->rememberExpiry(),
        ])->save();

        if ($previousSessionId !== null && $previousSessionId !== $sessionId) {
            Cache::forget(self::stateCacheKey($previousSessionId));
        }
        $this->current->set($device);
    }

    /** The not-ended device of $user this request is signed in with: the session's device, else the one its remember cookie matched. */
    public function currentOf(User $user, Request $request): ?UserDevice
    {
        $deviceId = ($request->hasSession() ? $request->session()->get(self::SESSION_KEY) : null) ?? $this->current->get()?->getKey();
        $device = $deviceId === null ? null : UserDevice::query()->find($deviceId);

        if ($device === null || $device->ended_at !== null || (int) $device->user_id !== (int) $user->getKey()) {
            return null;
        }

        return $device;
    }

    /** users.remember_token gets a fresh value no cookie carries, so every cookie from before devices stops working. */
    public function retireLegacyRememberToken(User $user): void
    {
        $this->holdRememberTokenInMemory($user, $this->retireLegacyRememberTokenOf((int) $user->getKey()));
    }

    /**
     * Ends the device once: its session row, cached state and remember token go; later calls do nothing.
     *
     * @param  array<string, mixed>|null  $endedBy
     */
    public function end(UserDevice $device, DeviceEndReason $reason, ?array $endedBy = null): void
    {
        $sessionId = $device->session_id;
        $rememberHash = $device->remember_token_hash;
        $rememberExpiresAt = $device->remember_expires_at;

        $ended = UserDevice::query()
            ->whereKey($device->getKey())
            ->whereNull('ended_at')
            ->update([
                'ended_at' => now(),
                'end_reason' => $reason->value,
                'ended_by' => $endedBy === null ? null : json_encode($endedBy),
                'session_id' => null,
                'remember_token_hash' => null,
            ]);

        if ($ended === 0) {
            return;
        }

        $device->refresh();
        $signedOut = $reason === DeviceEndReason::SignedOut;
        if (! $signedOut) {
            // A cookie from before devices could otherwise sign this browser straight back in
            $this->retireLegacyRememberTokenOf((int) $device->user_id);
        }
        $why = ['reason' => $reason->value, 'by' => $endedBy];
        if (! $signedOut && $rememberHash !== null && $rememberExpiresAt?->isFuture()) {
            // The remember cookie outlives the session note below
            Cache::put(self::endedTokenCacheKey($rememberHash), $why, $rememberExpiresAt);
        }
        if ($sessionId !== null) {
            if (! $signedOut) {
                Cache::put(self::endedCacheKey($sessionId), $why, now()->addMinutes((int) config('session.lifetime')));
            }
            $this->forgetSession($sessionId);
        }

        $this->events->record(
            $signedOut ? LoginEventType::SignedOut : LoginEventType::ForcedOut,
            null,
            request(),
            ['device' => $device, 'reason' => $signedOut ? null : $reason],
        );
    }

    /** Ends every active device of the account except the one on $keepSessionId; returns how many. */
    public function endAllOf(User $user, DeviceEndReason $reason, ?string $keepSessionId = null): int
    {
        $devices = $user->devices()
            ->active()
            ->when($keepSessionId !== null, fn ($query) => $query->where(fn ($other) => $other
                ->whereNull('session_id')
                ->orWhere('session_id', '!=', $keepSessionId)))
            ->get();

        $devices->each(fn (UserDevice $device) => $this->end($device, $reason));

        return $devices->count();
    }

    /** @return Collection<int, UserDevice> */
    public function active(User $user): Collection
    {
        return $this->activeOf($user->getKey());
    }

    /** Accounts over $limit keep one device (the $keepDeviceId one when it is theirs, else the latest used); returns how many ended. */
    public function trimTo(int $limit, ?int $keepDeviceId = null): int
    {
        if ($limit < 1) {
            return 0;
        }

        $userIds = UserDevice::query()
            ->active()
            ->groupBy('user_id')
            ->havingRaw('COUNT(*) > ?', [$limit])
            ->pluck('user_id');

        $ended = 0;
        foreach ($userIds as $userId) {
            $devices = $this->activeOf((int) $userId);
            $keep = ($keepDeviceId === null ? null : $devices->firstWhere('id', $keepDeviceId)) ?? $devices->first();

            foreach ($devices->reject(fn (UserDevice $device) => $device->is($keep)) as $device) {
                $this->end($device, DeviceEndReason::Limit);
                $ended++;
            }
        }

        return $ended;
    }

    /** @return Collection<int, UserDevice> */
    private function activeOf(int $userId): Collection
    {
        return UserDevice::query()
            ->active()
            ->where('user_id', $userId)
            ->orderByDesc('last_active_at')
            ->orderByDesc('id')
            ->get();
    }

    private function retireLegacyRememberTokenOf(int $userId): string
    {
        $token = Str::random(self::REMEMBER_TOKEN_LENGTH);
        User::query()->whereKey($userId)->toBase()->update([(new User)->getRememberTokenName() => $token]);

        return $token;
    }

    private function rememberExpiry(): CarbonInterface
    {
        return now()->addMinutes((int) config('auth.guards.web.remember'));
    }

    // Marked clean, so no later save() on this instance writes it to users.remember_token
    private function holdRememberTokenInMemory(User $user, string $token): void
    {
        $user->setRememberToken($token);
        $user->syncOriginalAttribute($user->getRememberTokenName());
    }

    private function forgetSession(string $sessionId): void
    {
        $table = config('session.table', 'sessions');
        $this->hasSessionTable ??= Schema::hasTable($table);
        if ($this->hasSessionTable) {
            DB::table($table)->where('id', $sessionId)->delete();
        }

        Cache::forget(self::stateCacheKey($sessionId));
    }

    private function userAgentOf(Request $request): ?string
    {
        $userAgent = trim((string) $request->userAgent());

        return $userAgent === '' ? null : mb_substr($userAgent, 0, self::USER_AGENT_MAX);
    }
}
