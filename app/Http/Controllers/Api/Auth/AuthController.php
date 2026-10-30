<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\UpdatePreferencesRequest;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Http\Resources\Auth\UserDeviceResource;
use App\Http\Resources\Auth\UserResource;
use App\Services\Auth\PasswordChangeService;
use App\Services\Auth\PendingLogin;
use App\Services\Auth\ProfileService;
use App\Services\Auth\SignInService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private SignInService $signIn, private ProfileService $profiles) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $user = $request->resolveUser();

        $refusal = $this->signIn->signIn($request, $user, $request->pendingToken());
        if ($refusal !== null) {
            return response()->json([
                'message' => 'device_limit',
                'limit' => $refusal['limit'],
                'expires_in' => PendingLogin::TTL_SECONDS,
                'pending' => $refusal['pending'],
                'devices' => UserDeviceResource::collection($refusal['devices'])->resolve($request),
            ], 409);
        }

        return (new UserResource($user))
            ->additional(['message' => 'success'])
            ->response();
    }

    public function logout(Request $request): JsonResponse
    {
        $this->signIn->signOut($request);

        return response()->json(['message' => 'success']);
    }

    public function me(Request $request): JsonResponse
    {
        return (new UserResource($request->user()))
            ->additional(['message' => 'success'])
            ->response();
    }

    public function updatePreferences(UpdatePreferencesRequest $request): JsonResponse
    {
        $user = $this->profiles->updatePreferences($request->user(), $request->validated());

        return (new UserResource($user))->additional(['message' => 'success'])->response();
    }

    /** The signed-in account edits its own profile (profile.edit). */
    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->profiles->updateProfile($request->user(), $request->safe()->except('photo'), $request->file('photo'));

        return (new UserResource($user))->additional(['message' => 'success'])->response();
    }

    /** Self-service password change, used both voluntarily and by the forced change-password flow. */
    public function changePassword(ChangePasswordRequest $request, PasswordChangeService $passwords): JsonResponse
    {
        $user = $passwords->change($request, $request->user(), $request->validated('password'), $request->accountThrottleKey());

        return (new UserResource($user))->additional(['message' => 'success'])->response();
    }
}
