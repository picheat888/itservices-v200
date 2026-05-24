<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
}
