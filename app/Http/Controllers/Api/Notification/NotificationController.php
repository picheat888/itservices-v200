<?php

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\NotificationKind;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

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

        $user = $request->user();
        $counts = $this->countsByKind($user);
        $matching = $user->notifications()
            ->when(isset($validated['kinds']), fn ($q) => $q->whereIn('kind', $validated['kinds']));
        $matchingCount = isset($validated['kinds']) ? (clone $matching)->count() : array_sum(array_column($counts, 'count'));
        $offset = (int) ($validated['offset'] ?? 0);

        // id breaks ties: rows created in the same second keep one order from page to page.
        $page = (clone $matching)->reorder()->orderByDesc('created_at')->orderByDesc('id')
            ->offset($offset)->limit(self::PAGE_SIZE)->get();

        return response()->json([
            'data' => $page->map(fn (DatabaseNotification $n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read' => ! is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
                // The real time: the SPA toasts what arrived, not what scrolled into the capped window.
                'created_at_iso' => $n->created_at->toIso8601String(),
            ]),
            'unread' => array_sum(array_column($counts, 'unread')),
            'total' => array_sum(array_column($counts, 'count')),
            'matching' => $matchingCount,
            'has_more' => $matchingCount > $offset + self::PAGE_SIZE,
            'counts' => $counts,
        ]);
    }

    /**
     * Totals and unread per kind, one grouped query; which module a kind belongs to is decided by the SPA's moduleOf().
     *
     * @return list<array{type: string|null, module: string|null, count: int, unread: int}>
     */
    private function countsByKind(User $user): array
    {
        return $user->notifications()->toBase()
            ->reorder()
            ->select('kind')
            ->selectRaw('COUNT(*) as total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) as unread_total')
            ->groupBy('kind')
            ->orderBy('kind')
            ->get()
            ->map(fn (object $row) => [
                ...NotificationKind::split((string) $row->kind),
                'count' => (int) $row->total,
                'unread' => (int) $row->unread_total,
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
