<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\Auth\UserResource;
use App\Models\AuditLog;
use App\Models\User;
use App\Notifications\PasswordExpiringNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

        // Backfill the password timestamp for legacy accounts so enabling the
        // expiry policy later doesn't instantly lock everyone out — their clock
        // starts from this sign-in instead of "never".
        $user = $request->user();
        if ($user->password_changed_at === null) {
            $user->forceFill(['password_changed_at' => now()])->saveQuietly();
        }

        AuditLog::record('Signed in');
        $this->warnAboutPasswordExpiry($user);

        return (new UserResource($request->user()))
            ->additional(['message' => 'success'])
            ->response();
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

    public function logout(Request $request): JsonResponse
    {
        AuditLog::record('Signed out');

        Auth::guard('web')->logout();

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
     * Gated by employees.edit_own. Writes to the linked Employee record and
     * mirrors the display name onto the User account.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user->hasPermission('employees.edit_own'), 403);

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
    public function changePassword(Request $request): JsonResponse
    {
        // Re-entering the current password guards against someone using an unattended,
        // already-signed-in session. That guard is moot right after an admin handed the
        // password over — the account is flagged, the person just authenticated with it,
        // and the temporary password is the one thing they would have to type twice.
        $forced = (bool) $request->user()?->must_change_password;

        $data = $request->validate([
            'current_password' => $forced ? ['nullable'] : ['required', 'current_password'],
            // Same complexity an admin must satisfy when setting a password for someone —
            // otherwise a forced change could weaken the account it was meant to protect.
            'password' => ['required', 'string', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
        ]);

        $user = $request->user();
        $user->forceFill([
            'password' => Hash::make($data['password']),
            'password_changed_at' => now(),
            'must_change_password' => false,
        ])->save();

        AuditLog::record('Changed own password');

        return (new UserResource($user->fresh()))->additional(['message' => 'success'])->response();
    }
}
