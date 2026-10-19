<?php

// Checks this session's device on every signed-in request: gives a device to a session without one, signs out a
// browser whose device was ended elsewhere (saying why), and records real use (writes and the ping) at most once a minute.

namespace App\Http\Middleware;

use App\Enums\Auth\DeviceEndReason;
use App\Models\Auth\UserDevice;
use App\Models\User;
use App\Services\Auth\CurrentDevice;
use App\Services\Auth\DeviceService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * @phpstan-type DeviceState array{id: int, user_id: int, end_reason: ?string, ended_by: ?array<string, mixed>, remember_expires_at: ?int, last_active_at: int}
 */
class TrackDevice
{
    private const STATE_SECONDS = 30;

    private const USE_EVERY_SECONDS = 60;

    private const RESTORE_WINDOW_SECONDS = 10;

    private const LOCK_SECONDS = 10;

    private const LOCK_WAIT_SECONDS = 5;

    public function __construct(
        private readonly DeviceService $devices,
        private readonly CurrentDevice $current,
    ) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Token clients have no session, so no device
        if (! $user instanceof User || ! $request->hasSession()) {
            return $next($request);
        }

        if (Auth::guard('web')->viaRemember()) {
            // A remember cookie does not bring back a browser whose session was ended elsewhere
            $ended = self::endedSessionOf($request);
            if ($ended !== null) {
                return self::signedOut($request, $ended['reason'], $ended['by']);
            }
            $state = $this->store($request, $this->stateOf($this->restored($user, $request)));
        } else {
            $state = $this->sessionState($user, $request);
        }

        if ($state['end_reason'] !== null) {
            return self::signedOut($request, $state['end_reason'], $state['ended_by']);
        }

        $now = now()->getTimestamp();
        if ($state['remember_expires_at'] !== null && $state['remember_expires_at'] <= $now) {
            $state = $this->outlivedRemember($request, $state, $now);
        } elseif ($state['remember_expires_at'] === null && $now - $state['last_active_at'] >= self::lifetimeSeconds()) {
            return $this->outlivedLifetime($request, $state);
        }

        if (CheckSessionTimeout::isActivity($request) && $now - $state['last_active_at'] >= self::USE_EVERY_SECONDS) {
            $this->used($request, $state, $now);
        }

        return $next($request);
    }

    /**
     * Why the device was ended: JSON 401 for the SPA (ending the session), else the login page (the SPA's next request still learns why).
     *
     * @param  array<string, mixed>|null  $endedBy
     */
    public static function signedOut(Request $request, string $reason, ?array $endedBy): Response
    {
        // The ended device's remember cookie can never sign in again
        Cookie::queue(Cookie::forget(Auth::guard('web')->getRecallerName()));

        if (! $request->expectsJson()) {
            if ($request->hasSession()) {
                $session = $request->session();
                // Signed out without cycling tokens; a cookie restore may have moved the session to a new id
                $session->forget([Auth::guard('web')->getName(), DeviceService::SESSION_KEY]);
                Cache::put(
                    DeviceService::endedCacheKey($session->getId()),
                    ['reason' => $reason, 'by' => $endedBy],
                    now()->addMinutes((int) config('session.lifetime')),
                );
            }

            return redirect('/login?reason='.rawurlencode($reason));
        }

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'device_signed_out', 'reason' => $reason, 'by' => $endedBy], 401);
    }

    /** A guest request whose session row went with its ended device gets the same answer; null leaves the usual one. */
    public static function answerLostSession(Request $request): ?Response
    {
        $ended = self::endedSessionOf($request);

        return $ended === null ? null : self::signedOut($request, $ended['reason'], $ended['by']);
    }

    /**
     * Why the session named by the browser's cookie was ended elsewhere, if it was.
     *
     * @return array{reason: string, by: ?array<string, mixed>}|null
     */
    private static function endedSessionOf(Request $request): ?array
    {
        $sessionId = $request->cookies->get(config('session.cookie'));
        $ended = is_string($sessionId) && $sessionId !== '' ? Cache::get(DeviceService::endedCacheKey($sessionId)) : null;

        return is_array($ended) ? $ended : null;
    }

    /** @return DeviceState */
    private function sessionState(User $user, Request $request): array
    {
        $session = $request->session();
        $deviceId = $session->get(DeviceService::SESSION_KEY);

        $cached = $deviceId === null ? null : Cache::get(DeviceService::stateCacheKey($session->getId()));
        if (is_array($cached) && $cached['id'] === (int) $deviceId && $cached['user_id'] === (int) $user->getKey()) {
            return $cached;
        }

        $device = $deviceId === null ? null : UserDevice::query()->find($deviceId);
        if ($device === null || (int) $device->user_id !== (int) $user->getKey()) {
            $device = $this->startedForSession($user, $request);
        } elseif ($device->ended_at === null && $device->session_id !== $session->getId()) {
            $device->forceFill(['session_id' => $session->getId()])->save();
        }

        return $this->store($request, $this->stateOf($device));
    }

    /** A session from before devices (or whose device row is gone) gets one, with no event: nobody is signed out by the deploy. */
    private function startedForSession(User $user, Request $request): UserDevice
    {
        $sessionId = $request->session()->getId();

        return Cache::lock('device-start:'.$sessionId, self::LOCK_SECONDS)
            ->block(self::LOCK_WAIT_SECONDS, function () use ($user, $request, $sessionId): UserDevice {
                // Requests fired together on this session share the device the first one made
                $started = $user->devices()->whereNull('ended_at')->where('session_id', $sessionId)->latest('id')->first();
                if ($started === null) {
                    return $this->devices->start($user, $request, null, recordEvent: false);
                }

                $request->session()->put(DeviceService::SESSION_KEY, $started->getKey());
                $this->current->set($started);

                return $started;
            });
    }

    /** A sign-in restored from the remember cookie: its device moves to this session, or an old cookie gets a device. */
    private function restored(User $user, Request $request): UserDevice
    {
        $device = $this->current->get();
        if ($device === null) {
            return $this->movedLegacyCookie($user, $request);
        }

        // Requests fired together after a wake-up record one sign-in; the others join the same device
        if (Cache::add('device-restored:'.$device->getKey(), true, self::RESTORE_WINDOW_SECONDS)) {
            $this->devices->reattach($device, $request);
        } else {
            $request->session()->put(DeviceService::SESSION_KEY, $device->getKey());
        }

        return $device;
    }

    /** A remember cookie from before devices: this browser gets a device with its own cookie, and the old cookie stops working. */
    private function movedLegacyCookie(User $user, Request $request): UserDevice
    {
        $movedKey = 'device-legacy-moved:'.$user->getKey().':'.hash('sha256', (string) $user->getRememberToken());

        return Cache::lock('device-legacy:'.$user->getKey(), self::LOCK_SECONDS)
            ->block(self::LOCK_WAIT_SECONDS, function () use ($user, $request, $movedKey): UserDevice {
                // Requests that passed the same old cookie's check together share the device the first one made
                $movedId = Cache::get($movedKey);
                $moved = $movedId === null ? null : UserDevice::query()->whereNull('ended_at')->find($movedId);
                if ($moved !== null) {
                    $request->session()->put(DeviceService::SESSION_KEY, $moved->getKey());
                    $this->current->set($moved);

                    return $moved;
                }

                $token = $this->devices->issueRememberToken($user);
                $device = $this->devices->start($user, $request, $token);
                Cookie::queue(
                    Auth::guard('web')->getRecallerName(),
                    $user->getKey().'|'.$token.'|'.$user->getAuthPassword(),
                    (int) config('auth.guards.web.remember'),
                );
                $this->devices->retireLegacyRememberToken($user);
                Cache::put($movedKey, $device->getKey(), self::RESTORE_WINDOW_SECONDS);

                return $device;
            });
    }

    /**
     * Past its remember period while the session is still alive: the device and session carry on as a plain sign-in.
     *
     * @param  DeviceState  $state
     * @return DeviceState
     */
    private function outlivedRemember(Request $request, array $state, int $now): array
    {
        UserDevice::query()->whereKey($state['id'])->whereNull('ended_at')->update([
            'remember_token_hash' => null,
            'remember_expires_at' => null,
            'last_active_at' => now(),
        ]);
        $request->session()->put(CheckSessionTimeout::REMEMBERED, false);
        $state['remember_expires_at'] = null;
        $state['last_active_at'] = $now;

        return $this->store($request, $state);
    }

    /**
     * Unused for longer than a plain device lives (polls kept the session alive): it ends like an idle timeout.
     *
     * @param  DeviceState  $state
     */
    private function outlivedLifetime(Request $request, array $state): Response
    {
        $device = UserDevice::query()->find($state['id']);
        if ($device !== null) {
            $this->devices->end($device, DeviceEndReason::IdleTimeout);
        }

        return self::signedOut($request, DeviceEndReason::IdleTimeout->value, null);
    }

    /** A plain device's lifetime, plus the minute its last use may trail the real one (use is written once a minute). */
    private static function lifetimeSeconds(): int
    {
        return UserDevice::lifetimeMinutes() * 60 + self::USE_EVERY_SECONDS;
    }

    /** @param  DeviceState  $state */
    private function used(Request $request, array $state, int $now): void
    {
        UserDevice::query()->whereKey($state['id'])->whereNull('ended_at')->update(['last_active_at' => now()]);
        $state['last_active_at'] = $now;

        $this->store($request, $state);
    }

    /** @return DeviceState */
    private function stateOf(UserDevice $device): array
    {
        return [
            'id' => (int) $device->getKey(),
            'user_id' => (int) $device->user_id,
            'end_reason' => $device->end_reason?->value,
            'ended_by' => $device->ended_by,
            'remember_expires_at' => $device->remember_expires_at?->getTimestamp(),
            'last_active_at' => $device->last_active_at?->getTimestamp() ?? 0,
        ];
    }

    /**
     * @param  DeviceState  $state
     * @return DeviceState
     */
    private function store(Request $request, array $state): array
    {
        Cache::put(DeviceService::stateCacheKey($request->session()->getId()), $state, self::STATE_SECONDS);

        return $state;
    }
}
