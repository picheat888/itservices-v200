<?php

// The profile Devices tab: the caller's active devices, signing another one out, and their last 10 login events.

namespace App\Http\Controllers\Api\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\Auth\LoginEventResource;
use App\Http\Resources\Auth\UserDeviceResource;
use App\Models\Auth\LoginEvent;
use App\Services\Auth\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MyDeviceController extends Controller
{
    private const EVENTS_SHOWN = 10;

    public function index(Request $request, DeviceService $devices): JsonResponse
    {
        return response()->json([
            'data' => UserDeviceResource::collection($devices->active($request->user())),
            'meta' => ['limit' => $devices->limit()],
        ]);
    }

    public function destroy(Request $request, int $device, DeviceService $devices): JsonResponse
    {
        $user = $request->user();
        $target = $user->devices()->active()->whereKey($device)->firstOrFail();

        if ($devices->currentOf($user, $request)?->is($target)) {
            return response()->json(['message' => 'current_device'], 422);
        }

        $devices->end($target, DeviceEndReason::Profile);

        return response()->json(['message' => 'success']);
    }

    public function events(Request $request): JsonResponse
    {
        $events = LoginEvent::query()
            ->with('user.employee')
            ->where('user_id', $request->user()->getKey())
            ->latest('created_at')
            ->latest('id')
            ->limit(self::EVENTS_SHOWN)
            ->get();

        return response()->json(['data' => LoginEventResource::collection($events)]);
    }
}
