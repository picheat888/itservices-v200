<?php

// The signed-in account's own preferences and profile (name, Thai name, phone, photo).

namespace App\Services\Auth;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class ProfileService
{
    /** Preferences the login screen can set, so they save while a password change is owed. */
    private const WALL_PREFERENCES = ['dark', 'lang', 'sidebar'];

    /**
     * @param  array<string, mixed>  $preferences
     */
    public function updatePreferences(User $user, array $preferences): User
    {
        // Behind the password wall only what the login screen can change gets through
        $owesPassword = $user->must_change_password || $user->isPasswordExpired();
        if ($owesPassword && array_diff(array_keys($preferences), self::WALL_PREFERENCES) !== []) {
            throw new HttpResponseException(response()->json(['message' => 'password_expired'], 403));
        }

        $user->preferences = array_merge($user->resolvedPreferences(), $preferences);
        $user->save();

        return $user;
    }

    /**
     * Writes the linked employee and mirrors the display name onto the account; an unlinked account keeps only its name.
     *
     * @param  array{first_name: string, last_name: string, first_name_th?: string|null, last_name_th?: string|null, phone?: string|null}  $data
     */
    public function updateProfile(User $user, array $data, ?UploadedFile $photo): User
    {
        $employee = $user->linkedEmployee();
        if ($employee) {
            $payload = [
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'first_name_th' => $data['first_name_th'] ?? null,
                'last_name_th' => $data['last_name_th'] ?? null,
                'phone' => $data['phone'] ?? null,
            ];
            if ($photo !== null) {
                if ($employee->photo_path) {
                    Storage::disk('local')->delete($employee->photo_path);
                }
                $payload['photo_path'] = $photo->store('employees', 'local');
            }
            $employee->update($payload);
        }

        $user->update(['name' => trim($data['first_name'].' '.$data['last_name'])]);
        AuditLog::record('Updated own profile', $user->name);

        return $user->fresh();
    }
}
