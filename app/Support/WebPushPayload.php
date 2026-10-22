<?php

// Builds the JSON a push carries for one bell (what the service worker reads), kept under the push service size limit.

namespace App\Support;

use App\Models\User;
use Illuminate\Notifications\DatabaseNotification;

final class WebPushPayload
{
    public const MAX_BYTES = 3000;

    /** @return array<string, mixed> */
    public static function for(DatabaseNotification $notification, User $user): array
    {
        $data = (array) $notification->data;
        $payload = [
            'v' => 1,
            'id' => (string) $notification->id,
            'lang' => self::langOf($user),
            'created_at_iso' => $notification->created_at?->toIso8601String() ?? now()->toIso8601String(),
            'data' => $data,
        ];

        if (strlen(json_encode($payload)) <= self::MAX_BYTES) {
            return $payload;
        }

        $payload['data'] = ['type' => $data['type'] ?? null];
        $payload['truncated'] = true;

        return $payload;
    }

    /** @return array<string, mixed> */
    public static function test(User $user): array
    {
        return ['v' => 1, 'id' => 'test', 'lang' => self::langOf($user), 'test' => true];
    }

    private static function langOf(User $user): string
    {
        return ($user->resolvedPreferences()['lang'] ?? 'en') === 'th' ? 'th' : 'en';
    }
}
