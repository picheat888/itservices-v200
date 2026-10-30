<?php

// Stores a self-service password change and keeps only this device signed in.

namespace App\Services\Auth;

use App\Http\Middleware\CheckSessionTimeout;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class PasswordChangeService
{
    public function __construct(private DeviceService $devices) {}

    /** Stamps password_changed_at so the expiry policy resets, then signs every other device out. */
    public function change(Request $request, User $user, string $password, string $accountThrottleKey): User
    {
        $user->forceFill([
            'password' => Hash::make($password),
            'password_changed_at' => now(),
            'must_change_password' => false,
        ])->save();
        RateLimiter::clear($accountThrottleKey);

        // A token client has no session to keep
        $session = $request->hasSession() ? $request->session() : null;
        $user->signOutEverywhere($session?->getId());
        if ($session?->get(CheckSessionTimeout::REMEMBERED) === true) {
            $this->rememberThisDeviceAgain($request, $user);
        } elseif ($session !== null) {
            $this->moveThisDeviceToANewSessionId($request, $user);
        }

        AuditLog::record('Changed own password');

        return $user->fresh();
    }

    /** A copy of the old session cookie stops working: the session gets a new id, the old one is destroyed, the device follows. */
    private function moveThisDeviceToANewSessionId(Request $request, User $user): void
    {
        $device = $this->devices->currentOf($user, $request);
        // migrate(), not regenerate(): the CSRF token stays, so requests already in flight are not refused with 419
        $request->session()->migrate(true);

        if ($device !== null) {
            $this->devices->moveToSession($device, $request->session()->getId());
        }
    }

    /** The device that changed the password stays remembered: a new device token and cookie, on the new session id. */
    private function rememberThisDeviceAgain(Request $request, User $user): void
    {
        $device = $this->devices->currentOf($user, $request);
        $token = $this->devices->issueRememberToken($user);

        Auth::guard('web')->login($user, true);

        if ($device === null) {
            $this->devices->start($user, $request, $token, recordEvent: false);

            return;
        }

        $this->devices->rememberAgain($device, $token, $request->session()->getId());
    }
}
