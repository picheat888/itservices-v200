<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

        \App\Models\AuditLog::record('Signed in');

        return (new UserResource($request->user()))
            ->additional(['message' => 'success'])
            ->response();
    }

    public function logout(Request $request): JsonResponse
    {
        \App\Models\AuditLog::record('Signed out');

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
            'name'    => ['required', 'string', 'max:255'],
            'name_th' => ['nullable', 'string', 'max:255'],
            'phone'   => ['nullable', 'string', 'max:50'],
            'photo'   => ['nullable', 'image', 'max:2048'],
        ]);

        $employee = $user->linkedEmployee();
        if ($employee) {
            $payload = [
                'name'    => $data['name'],
                'name_th' => $data['name_th'] ?? null,
                'phone'   => $data['phone'] ?? null,
            ];
            if ($request->hasFile('photo')) {
                if ($employee->photo_path) {
                    Storage::disk('public')->delete($employee->photo_path);
                }
                $payload['photo_path'] = $request->file('photo')->store('employees', 'public');
            }
            $employee->update($payload);
        }

        // Keep the login account's display name in sync with the profile.
        $user->update(['name' => $data['name']]);
        \App\Models\AuditLog::record('Updated own profile', $user->name);

        return (new UserResource($user->fresh()))->additional(['message' => 'success'])->response();
    }
}
