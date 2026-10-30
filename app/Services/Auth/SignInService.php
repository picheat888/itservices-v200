<?php

// Signs an account in within the device limit and signs this browser out.

namespace App\Services\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Http\Middleware\CheckSessionTimeout;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\AuditLog;
use App\Models\Auth\UserDevice;
use App\Models\User;
use App\Notifications\PasswordExpiringNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Cookie;

class SignInService
{
    private const DEVICE_LOCK_SECONDS = 10;

    private const DEVICE_LOCK_WAIT_SECONDS = 5;

    public function __construct(private DeviceService $devices, private PendingLogin $pendingLogins) {}

    /**
     * Signs in, or returns why not when the account has no free device.
     *
     * @return array{limit: int, pending: string, devices: Collection<int, UserDevice>}|null
     */
    public function signIn(LoginRequest $request, User $user, ?string $pending): ?array
    {
        $refusal = Cache::lock("device-limit:{$user->id}", self::DEVICE_LOCK_SECONDS)
            ->block(self::DEVICE_LOCK_WAIT_SECONDS, fn () => $this->signInWithinLimit($request, $user, $pending));
        if ($refusal !== null) {
            return $refusal;
        }

        // Legacy accounts: the expiry clock starts at this sign-in, not "never"
        if ($user->password_changed_at === null) {
            $user->forceFill(['password_changed_at' => now()])->saveQuietly();
        }

        AuditLog::record('Signed in');
        $this->warnAboutPasswordExpiry($user);

        return null;
    }

    public function signOut(Request $request): void
    {
        AuditLog::record('Signed out');

        $device = $this->devices->currentOf($request->user(), $request);
        if ($device !== null) {
            $this->devices->end($device, DeviceEndReason::SignedOut);
        }

        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    /**
     * Signs in and starts the device when the account has room; otherwise the device list.
     *
     * @return array{limit: int, pending: string, devices: Collection<int, UserDevice>}|null
     */
    private function signInWithinLimit(LoginRequest $request, User $user, ?string $pending): ?array
    {
        if ($pending !== null && $this->pendingLogins->user($pending, $request) === null) {
            throw LoginRequest::pendingExpired();
        }

        // This browser's own seat for the same account is ended below, so it never counts
        $browserDevice = $this->thisBrowsersDevice($request);
        $limit = $this->devices->limit();
        $active = $this->devices->active($user)->reject(fn (UserDevice $device) => $device->id === $browserDevice?->id)->values();
        if ($limit > 0 && $active->count() >= $limit) {
            return [
                'limit' => $limit,
                'pending' => $pending ?? $this->pendingLogins->issue($user, $request),
                'devices' => $active,
            ];
        }

        $this->endThisBrowsersSignIn($request, $browserDevice);

        $remember = $request->boolean('remember');
        $rememberToken = $remember ? $this->devices->issueRememberToken($user) : null;

        Auth::guard('web')->login($user, $remember);
        $request->session()->regenerate();
        // Remembered sign-ins are exempt from the idle timeout (CheckSessionTimeout)
        $request->session()->put(CheckSessionTimeout::REMEMBERED, $remember);
        $this->devices->start($user, $request, $rememberToken);

        if ($pending !== null) {
            $this->pendingLogins->forget($pending);
        }

        return null;
    }

    /** The device this browser is still signed in on, if any. */
    private function thisBrowsersDevice(Request $request): ?UserDevice
    {
        $deviceId = $request->hasSession() ? $request->session()->get(DeviceService::SESSION_KEY) : null;

        return $deviceId === null ? null : UserDevice::query()->whereNull('ended_at')->find($deviceId);
    }

    /** A sign-in from a login tab left open in a signed-in browser ends that browser's device: its seat frees and its remember cookie goes. */
    private function endThisBrowsersSignIn(Request $request, ?UserDevice $device): void
    {
        if ($device !== null) {
            $this->devices->end($device, DeviceEndReason::SignedOut);
        }

        $recaller = Auth::guard('web')->getRecallerName();
        if ($request->cookies->has($recaller)) {
            Cookie::queue(Cookie::forget($recaller));
        }
    }

    /** At each sign-in near the expiry, one tray notice with today's day count; none once a password change is already owed. */
    private function warnAboutPasswordExpiry(User $user): void
    {
        if ($user->must_change_password || $user->isPasswordExpired()) {
            return;
        }

        $remaining = $user->passwordDaysRemaining();
        if ($remaining === null || $remaining > User::PASSWORD_EXPIRY_WARNING_DAYS) {
            return;
        }

        $user->notifications()
            ->where('type', PasswordExpiringNotification::class)
            ->delete();

        $user->notify(new PasswordExpiringNotification($remaining));
    }
}
