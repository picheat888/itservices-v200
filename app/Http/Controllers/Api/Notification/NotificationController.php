<?php

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Collection;

/**
 * Manages the current user's database notifications (in-app bell).
 */
class NotificationController extends Controller
{
    /** One page of the tray. */
    private const PAGE_SIZE = 30;

    /**
     * A page of the user's notifications, newest first, optionally narrowed to some kinds ("type|module",
     * as the counts report them) and starting at an offset, plus whole-inbox totals for the badge and chips.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kinds' => ['sometimes', 'array', 'max:50'],
            'kinds.*' => ['string', 'max:100'],
            'offset' => ['sometimes', 'integer', 'min:0'],
        ]);

        // Filtered in PHP rather than on a JSON path, which differs by driver (MariaDB vs the SQLite tests run on).
        $all = $request->user()->notifications()->latest()->get();
        $matching = isset($validated['kinds'])
            ? $all->filter(fn (DatabaseNotification $n) => in_array($this->kindOf($n), $validated['kinds'], true))->values()
            : $all;
        $offset = (int) ($validated['offset'] ?? 0);

        return response()->json([
            'data' => $matching->slice($offset, self::PAGE_SIZE)->values()->map(fn (DatabaseNotification $n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read' => ! is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
                // The real time: the SPA toasts what arrived, not what scrolled into the capped window.
                'created_at_iso' => $n->created_at->toIso8601String(),
            ]),
            'unread' => $all->whereNull('read_at')->count(),
            'total' => $all->count(),
            'matching' => $matching->count(),
            'has_more' => $matching->count() > $offset + self::PAGE_SIZE,
            'counts' => $this->countsByKind($all),
        ]);
    }

    /** The payload's type plus, for a test sample, the module it imitates. */
    private function kindOf(DatabaseNotification $notification): string
    {
        return ($notification->data['type'] ?? '').'|'.($notification->data['module'] ?? '');
    }

    /**
     * Totals and unread per kind; which module a kind belongs to is decided by the SPA's moduleOf().
     *
     * @param  Collection<int, DatabaseNotification>  $notifications
     * @return list<array{type: string|null, module: string|null, count: int, unread: int}>
     */
    private function countsByKind(Collection $notifications): array
    {
        return $notifications
            ->groupBy(fn (DatabaseNotification $n) => $this->kindOf($n))
            ->map(fn (Collection $group) => [
                'type' => $group->first()->data['type'] ?? null,
                'module' => $group->first()->data['module'] ?? null,
                'count' => $group->count(),
                'unread' => $group->whereNull('read_at')->count(),
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
