<?php

// The bell tray: one page of the user's notifications plus whole-inbox totals per kind for the badge and chips.

namespace App\Services\Notification;

use App\Models\User;
use App\Support\NotificationKind;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Date;

class NotificationFeedService
{
    /** One page of the tray. */
    public const PAGE_SIZE = 30;

    /**
     * Newest first, optionally narrowed to some kinds ("type|module") and starting at an offset.
     *
     * @param  array{kinds?: list<string>, offset?: int|string, since?: string}  $filters
     * @return array<string, mixed>
     */
    public function page(User $user, array $filters): array
    {
        $counts = $this->countsByKind($user);
        $matching = $user->notifications()
            ->when(isset($filters['kinds']), fn ($q) => $q->whereIn('kind', $filters['kinds']));
        $matchingCount = isset($filters['kinds']) ? (clone $matching)->count() : array_sum(array_column($counts, 'count'));
        $offset = (int) ($filters['offset'] ?? 0);

        // id breaks ties: rows created in the same second keep one order from page to page
        $page = (clone $matching)->reorder()->orderByDesc('created_at')->orderByDesc('id')
            ->offset($offset)->limit(self::PAGE_SIZE)->get();

        $body = [
            'data' => $page->map(fn (DatabaseNotification $n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read' => ! is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
                // The SPA toasts what arrived, not what scrolled into the capped window
                'created_at_iso' => $n->created_at->toIso8601String(),
            ]),
            'unread' => array_sum(array_column($counts, 'unread')),
            'total' => array_sum(array_column($counts, 'count')),
            'matching' => $matchingCount,
            'has_more' => $matchingCount > $offset + self::PAGE_SIZE,
            'counts' => $counts,
        ];

        // Unread rows that arrived after the reader last looked, for the catch-up toast
        if (isset($filters['since'])) {
            $since = Date::parse($filters['since'])->setTimezone(config('app.timezone'));
            $body['unread_since'] = $user->unreadNotifications()->where('created_at', '>', $since)->count();
        }

        return $body;
    }

    /**
     * Totals and unread per kind in one grouped query; the SPA's moduleOf() decides each kind's module.
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
}
