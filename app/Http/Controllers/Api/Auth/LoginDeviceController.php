<?php

// Signs one of the account's devices out from the device-limit dialog; the pending token is the only proof of the password.

namespace App\Http\Controllers\Api\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\Auth\UserDeviceResource;
use App\Services\Auth\DeviceService;
use App\Services\Auth\LoginEventRecorder;
use App\Services\Auth\PendingLogin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoginDeviceController extends Controller
{
    public function signOut(Request $request, int $device, PendingLogin $pendingLogins, DeviceService $devices, LoginEventRecorder $events): JsonResponse
    {
        $data = $request->validate(['pending' => ['required', 'string', 'max:100']]);

        $user = $pendingLogins->user($data['pending'], $request) ?? throw LoginRequest::pendingExpired();
        $target = $user->devices()->active()->whereKey($device)->firstOrFail();

        $requester = $events->describe($request);
        $devices->end($target, DeviceEndReason::ThirdDevice, [
            'os' => $requester['os'],
            'browser' => $requester['browser'],
            'location' => $requester['location'],
            'at' => now()->toIso8601String(),
        ]);

        return (new UserDeviceResource($target->fresh()))
            ->additional(['message' => 'success'])
            ->response();
    }
}
