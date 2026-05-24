<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Manages the current user's database notifications (in-app bell).
 */
class NotificationController extends Controller
{
    /** Returns the 30 most recent notifications for the authenticated user. */
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()
            ->notifications()
            ->latest()
            ->limit(30)
            ->get()
            ->map(fn ($n) => [
                'id'         => $n->id,
                'data'       => $n->data,
                'read'       => ! is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
            ]);

        $unread = $request->user()->unreadNotifications()->count();

        return response()->json(['data' => $notifications, 'unread' => $unread]);
    }

    /** Marks a single notification as read. */
    public function markRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->where('id', $id)->firstOrFail();
        $notification->markAsRead();

        return response()->json(['message' => 'success']);
    }

    /** Marks all notifications for the current user as read. */
    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'success']);
    }

    /** Dismisses (deletes) a single notification belonging to the current user. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $request->user()->notifications()->where('id', $id)->firstOrFail()->delete();

        return response()->json(['message' => 'success']);
    }
}
