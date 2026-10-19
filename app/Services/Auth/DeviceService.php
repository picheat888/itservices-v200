<?php

// Starts, reattaches, lists, ends and trims the per-browser device rows that the device limit counts.

namespace App\Services\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DeviceService
{
    /** Session key holding this session's device id. */
    public const SESSION_KEY = '_device_id';

    private const USER_AGENT_MAX = 300;

    private const IPAD_OS = 'iPadOS';

    public function __construct(
        private readonly LoginEventRecorder $events,
        private readonly CurrentDevice $current,
    ) {}

    /** Cache key of a session's device state; forgotten when the device ends. */
    public static function stateCacheKey(string $sessionId): string
    {
        return 'device-state:'.$sessionId;
    }

    /** The per-account device limit; 0 = off. */
    public function limit(): int
    {
        return (int) AppSetting::get('device_limit', '0');
    }

    public function start(User $user, Request $request, ?string $rememberToken, bool $recordEvent = true): UserDevice
    {
        $now = now();
        $session = $request->hasSession() ? $request->session() : null;
        $remembered = $rememberToken !== null;

        $device = $user->devices()->create([
            'session_id' => $session?->getId(),
            'remember_token_hash' => $remembered ? hash('sha256', $rememberToken) : null,
            'remember_expires_at' => $remembered ? $now->copy()->addMinutes((int) config('auth.guards.web.remember')) : null,
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

    /**
     * Ends the device once: its session row, cached state and remember token go; later calls do nothing.
     *
     * @param  array<string, mixed>|null  $endedBy
     */
    public function end(UserDevice $device, DeviceEndReason $reason, ?array $endedBy = null): void
    {
        $sessionId = $device->session_id;

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
        if ($sessionId !== null) {
            $this->forgetSession($sessionId);
        }

        $signedOut = $reason === DeviceEndReason::SignedOut;
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

    private function forgetSession(string $sessionId): void
    {
        $table = config('session.table', 'sessions');
        if (Schema::hasTable($table)) {
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
