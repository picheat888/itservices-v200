<?php

namespace App\Http\Middleware;

use App\Models\Settings\AppSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Inactivity timeout on top of Laravel's session: past the configured window (plus a heartbeat of grace)
 * the session is invalidated and the SPA gets 401 "session_expired". Remembered sign-ins are exempt.
 */
class CheckSessionTimeout
{
    /** Session key: whether this sign-in was made with "remember me" ticked. */
    public const REMEMBERED = '_sec_remembered';

    /** Session key: the id of this session's idle clock, whose time is kept in the cache. */
    public const IDLE_CLOCK = '_sec_idle_clock';

    /** The browser warns and signs out on time; the server waits one heartbeat (its longest) longer. */
    public const GRACE_SECONDS = 60;

    public static function clockKey(string $clock): string
    {
        return 'session-idle:'.$clock;
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $minutes = (int) AppSetting::get('session_timeout_minutes', '0');

        // Token clients have no session to time out
        if (! $request->user() || ! $request->hasSession()) {
            return $next($request);
        }

        $session = $request->session();
        if (Auth::guard('web')->viaRemember()) {
            $session->put(self::REMEMBERED, true);
        }

        if ($minutes <= 0 || $session->get(self::REMEMBERED) === true) {
            return $next($request);
        }

        $clock = $session->get(self::IDLE_CLOCK);
        $lastActivity = is_string($clock) ? Cache::get(self::clockKey($clock)) : null;
        $now = time();

        // A started clock with no time left in the cache counts as expired, never as a fresh start
        $lost = is_string($clock) && $lastActivity === null;
        if ($lost || ($lastActivity !== null && $now - $lastActivity > $minutes * 60 + self::GRACE_SECONDS)) {
            Cache::forget(self::clockKey((string) $clock));
            // Invalidating is the logout for cookie SPA auth; the sanctum guard's logout() would throw
            $session->invalidate();
            $session->regenerateToken();

            return response()->json(['message' => 'session_expired'], 401);
        }

        if (! is_string($clock)) {
            $clock = Str::random(40);
            $session->put(self::IDLE_CLOCK, $clock);
        }

        if ($lastActivity === null || $this->isActivity($request)) {
            $keepFor = 2 * max($minutes * 60 + self::GRACE_SECONDS, (int) config('session.lifetime') * 60);
            Cache::put(self::clockKey($clock), $now, $keepFor);
        }

        return $next($request);
    }

    /** Only the browser's activity ping and writes count; reads the page makes on its own do not. */
    private function isActivity(Request $request): bool
    {
        return ! $request->isMethodSafe() || $request->routeIs('api.session.ping');
    }
}
