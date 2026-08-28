<?php

namespace App\Http\Controllers\Api\Notification;

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
                'id' => $n->id,
                'data' => $n->data,
                'read' => ! is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
                // A real timestamp beside the human one. The SPA pops a toast for anything that
                // ARRIVED while you were watching, and "arrived" cannot be told from "became
                // visible" without it: this list is capped, so deleting one row pulls an older
                // one into the window, which used to read as a new alert and pop a toast.
                'created_at_iso' => $n->created_at->toIso8601String(),
            ]);

        $unread = $request->user()->unreadNotifications()->count();

        return response()->json([
            'data' => $notifications,
            'unread' => $unread,
            // How many exist, not how many were sent. The list above is capped, and the tray's
            // filter chips used to count the rows they had been given — so "All 30" meant "the
            // window is full", and dismissing one left it saying 30 again. These are the real
            // figures the chips are supposed to be reporting.
            'total' => $request->user()->notifications()->count(),
            'counts' => $this->countsByType($request),
        ]);
    }

    /**
     * How many notifications the user holds, grouped by the payload's type (and, for a test
     * sample, the module it imitates).
     *
     * Deliberately NOT grouped into modules here. Which module a type belongs to is decided by
     * the SPA's moduleOf(), and a second copy of that mapping on this side would be one more
     * pair of lists to keep in step. The server counts; the front end classifies.
     *
     * @return list<array{type: string|null, module: string|null, count: int}>
     */
    private function countsByType(Request $request): array
    {
        // Tallied in PHP rather than with a GROUP BY on a JSON path. The JSON functions differ
        // by driver — the first attempt used JSON_UNQUOTE, which is fine on MariaDB and does
        // not exist in the SQLite the tests run on. One column of one user's own rows is a
        // small enough read to do the grouping here and stay portable.
        return $request->user()->notifications()
            ->get(['data'])
            ->groupBy(fn ($notification) => ($notification->data['type'] ?? '').'|'.($notification->data['module'] ?? ''))
            ->map(fn ($group) => [
                'type' => $group->first()->data['type'] ?? null,
                'module' => $group->first()->data['module'] ?? null,
                'count' => $group->count(),
            ])
            ->values()
            ->all();
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
