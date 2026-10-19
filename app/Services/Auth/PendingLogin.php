<?php

// The short-lived proof that a password was right while the account is at its device limit,
// bound to the account and to the browser session that asked.

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class PendingLogin
{
    private const TOKEN_LENGTH = 40;

    private const TTL_SECONDS = 300;

    public function issue(User $user, Request $request): string
    {
        $token = Str::random(self::TOKEN_LENGTH);

        Cache::put(self::cacheKey($token), [
            'user_id' => $user->getKey(),
            'session_id' => $request->session()->getId(),
        ], self::TTL_SECONDS);

        return $token;
    }

    /** The account behind the token; null when it expired, was used, or another session holds it. */
    public function user(string $token, Request $request): ?User
    {
        $entry = Cache::get(self::cacheKey($token));
        if (! is_array($entry) || ! $request->hasSession()) {
            return null;
        }

        if (! hash_equals((string) $entry['session_id'], (string) $request->session()->getId())) {
            return null;
        }

        return User::query()->find($entry['user_id']);
    }

    public function forget(string $token): void
    {
        Cache::forget(self::cacheKey($token));
    }

    private static function cacheKey(string $token): string
    {
        return 'pending-login:'.$token;
    }
}
