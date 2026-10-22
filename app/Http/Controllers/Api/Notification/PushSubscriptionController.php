<?php

// Stores and removes the signed-in user's Web Push subscription for the current browser.

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notification\StorePushSubscriptionRequest;
use App\Notifications\WebPushRelay;
use App\Support\WebPushPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class PushSubscriptionController extends Controller
{
    public function store(StorePushSubscriptionRequest $request): JsonResponse
    {
        $request->user()->updatePushSubscription(
            $request->validated('endpoint'),
            $request->validated('keys.p256dh'),
            $request->validated('keys.auth'),
            $request->validated('content_encoding'),
        );

        return response()->json(['message' => 'success'], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:500']]);

        $request->user()->deletePushSubscription($data['endpoint']);

        return response()->json(['message' => 'success']);
    }

    public function test(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:500']]);

        $subscriptions = $request->user()->pushSubscriptions()->where('endpoint', $data['endpoint'])->get();
        abort_if($subscriptions->isEmpty(), 404);

        Notification::route('WebPush', $subscriptions)->notify(new WebPushRelay(WebPushPayload::test($request->user())));

        return response()->json(['message' => 'success'], 202);
    }
}
