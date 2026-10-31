<?php

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use App\Services\Notification\NotificationFeedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The current user's in-app bell: the tray page, mark read, mark all read and dismiss. */
class NotificationController extends Controller
{
    /** A page of the user's notifications with whole-inbox totals for the badge and chips. */
    public function index(Request $request, NotificationFeedService $feed): JsonResponse
    {
        $validated = $request->validate([
            'kinds' => ['sometimes', 'array', 'max:50'],
            'kinds.*' => ['string', 'max:100'],
            'offset' => ['sometimes', 'integer', 'min:0'],
            'since' => ['sometimes', 'date'],
        ]);

        return response()->json($feed->page($request->user(), $validated));
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
        // One UPDATE, not a load-and-save per row.
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['message' => 'success']);
    }

    /** Dismisses (deletes) a single notification belonging to the current user. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $request->user()->notifications()->where('id', $id)->firstOrFail()->delete();

        return response()->json(['message' => 'success']);
    }
}
