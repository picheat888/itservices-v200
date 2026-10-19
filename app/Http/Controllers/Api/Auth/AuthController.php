<?php

namespace App\Http\Controllers\Api\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Http\Controllers\Controller;
use App\Http\Middleware\CheckSessionTimeout;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\Auth\UserDeviceResource;
use App\Http\Resources\Auth\UserResource;
use App\Models\AuditLog;
use App\Models\User;
use App\Notifications\PasswordExpiringNotification;
use App\Services\Auth\DeviceService;
use App\Services\Auth\PendingLogin;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    private const DEVICE_LOCK_SECONDS = 10;

    private const DEVICE_LOCK_WAIT_SECONDS = 5;

    public function login(LoginRequest $request, DeviceService $devices, PendingLogin $pendingLogins): JsonResponse
    {
        $user = $request->resolveUser();
        $pending = $request->pendingToken();

        $refusal = Cache::lock("device-limit:{$user->id}", self::DEVICE_LOCK_SECONDS)
            ->block(self::DEVICE_LOCK_WAIT_SECONDS, fn () => $this->signInWithinLimit($request, $user, $pending, $devices, $pendingLogins));
        if ($refusal !== null) {
            return $refusal;
        }

        // Legacy accounts: the expiry clock starts at this sign-in, not "never"
        if ($user->password_changed_at === null) {
            $user->forceFill(['password_changed_at' => now()])->saveQuietly();
        }

        AuditLog::record('Signed in');
        $this->warnAboutPasswordExpiry($user);

        return (new UserResource($user))
            ->additional(['message' => 'success'])
            ->response();
    }

    /** Signs in and starts the device when the account has room; otherwise the 409 device list. */
    private function signInWithinLimit(LoginRequest $request, User $user, ?string $pending, DeviceService $devices, PendingLogin $pendingLogins): ?JsonResponse
    {
        if ($pending !== null && $pendingLogins->user($pending, $request) === null) {
            throw LoginRequest::pendingExpired();
        }

        $limit = $devices->limit();
        $active = $devices->active($user);
        if ($limit > 0 && $active->count() >= $limit) {
            return response()->json([
                'message' => 'device_limit',
                'limit' => $limit,
                'expires_in' => PendingLogin::TTL_SECONDS,
                'pending' => $pending ?? $pendingLogins->issue($user, $request),
                'devices' => UserDeviceResource::collection($active)->resolve($request),
            ], 409);
        }

        $remember = $request->boolean('remember');
        $rememberToken = $remember ? $devices->issueRememberToken($user) : null;

        Auth::guard('web')->login($user, $remember);
        $request->session()->regenerate();
        // Remembered sign-ins are exempt from the idle timeout (CheckSessionTimeout)
        $request->session()->put(CheckSessionTimeout::REMEMBERED, $remember);
        $devices->start($user, $request, $rememberToken);

        if ($pending !== null) {
            $pendingLogins->forget($pending);
        }

        return null;
    }

    /**
     * Put a notice in the tray when the expiry policy is about to lock this account out.
     *
     * Sign-in is the trigger because the deadline is per-account and moves whenever
     * somebody changes their password — there is no day on which a sweep could usefully
     * ask the question for everyone, and arriving is the one moment the notice is certain
     * to be seen.
     *
     * Says nothing once the password has actually expired: CheckPasswordExpiry already
     * refuses every route by then, and the SPA puts up a dialog that cannot be dismissed.
     * The same goes for an account owing an administrator-forced change — it is being
     * asked in a louder way already.
     *
     * The previous notice is deleted first, so the tray holds one of these at a time. The
     * warning is meant to come back at every sign-in until it is acted on, and a notice
     * that returns has to carry today's count rather than the count it was born with.
     */
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

    public function logout(Request $request, DeviceService $devices): JsonResponse
    {
        AuditLog::record('Signed out');

        $user = $request->user();
        $device = $devices->currentOf($user, $request);
        if ($device !== null) {
            $devices->end($device, DeviceEndReason::SignedOut);
        }

        Auth::guard('web')->logout();
        $devices->retireLegacyRememberToken($user);

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'success']);
    }

    public function me(Request $request): JsonResponse
    {
        return (new UserResource($request->user()))
            ->additional(['message' => 'success'])
            ->response();
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $data = $request->validate([
            'dark' => ['sometimes', 'boolean'],
            'lang' => ['sometimes', 'in:en,th'],
            'density' => ['sometimes', 'in:compact,normal,cozy'],
            'radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
            'sidebar' => ['sometimes', 'in:labeled,icons'],
            'accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $user = $request->user();
        $user->preferences = array_merge($user->resolvedPreferences(), $data);
        $user->save();

        return (new UserResource($user))->additional(['message' => 'success'])->response();
    }

    /**
     * Lets a user edit their OWN profile (name / Thai name / phone / photo).
     * Gated by profile.edit. Writes to the linked Employee record and
     * mirrors the display name onto the User account.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user->hasPermission('profile.edit'), 403);

        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'first_name_th' => ['nullable', 'string', 'max:255'],
            'last_name_th' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ]);

        $employee = $user->linkedEmployee();
        if ($employee) {
            $payload = [
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'first_name_th' => $data['first_name_th'] ?? null,
                'last_name_th' => $data['last_name_th'] ?? null,
                'phone' => $data['phone'] ?? null,
            ];
            if ($request->hasFile('photo')) {
                if ($employee->photo_path) {
                    Storage::disk('local')->delete($employee->photo_path);
                }
                $payload['photo_path'] = $request->file('photo')->store('employees', 'local');
            }
            $employee->update($payload);
        }

        // Keep the login account's display name in sync with the profile.
        $user->update(['name' => trim($data['first_name'].' '.$data['last_name'])]);
        AuditLog::record('Updated own profile', $user->name);

        return (new UserResource($user->fresh()))->additional(['message' => 'success'])->response();
    }

    /**
     * Self-service password change. Verifies the current password, stores the
     * new one, and stamps password_changed_at so the expiry policy resets.
     * Used both voluntarily and by the forced change-password flow.
     */
    public function changePassword(Request $request, DeviceService $devices): JsonResponse
    {
        // A forced change waives the current password: the person just signed in with it
        $forced = (bool) $request->user()?->must_change_password;

        $data = $request->validate([
            'current_password' => $forced ? ['nullable'] : ['required', 'current_password'],
            'password' => [
                'required', 'string', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols(),
                // Reusing the current password would reset the expiry clock or keep the handed-over one
                function (string $attribute, mixed $value, Closure $fail) use ($request): void {
                    if (is_string($value) && Hash::check($value, $request->user()->password)) {
                        $fail('validation.password_reused')->translate();
                    }
                },
            ],
        ]);

        $user = $request->user();
        $user->forceFill([
            'password' => Hash::make($data['password']),
            'password_changed_at' => now(),
            'must_change_password' => false,
        ])->save();

        // Every other device is signed out; a token client has no session to keep
        $session = $request->hasSession() ? $request->session() : null;
        $user->signOutEverywhere($session?->getId());
        if ($session?->get(CheckSessionTimeout::REMEMBERED) === true) {
            $this->rememberThisDeviceAgain($request, $user, $devices);
        }

        AuditLog::record('Changed own password');

        return (new UserResource($user->fresh()))->additional(['message' => 'success'])->response();
    }

    /** The device that changed the password stays remembered: a new device token and cookie, on the new session id. */
    private function rememberThisDeviceAgain(Request $request, User $user, DeviceService $devices): void
    {
        $device = $devices->currentOf($user, $request);
        $token = $devices->issueRememberToken($user);

        Auth::guard('web')->login($user, true);

        if ($device === null) {
            $devices->start($user, $request, $token, recordEvent: false);

            return;
        }

        $devices->rememberAgain($device, $token, $request->session()->getId());
    }
}
