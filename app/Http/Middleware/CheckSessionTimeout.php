<?php

namespace App\Http\Middleware;

use App\Models\Settings\AppSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Inactivity timeout on top of Laravel's session: past the configured window the session is
 * invalidated and the SPA gets 401 "session_expired". Remembered sign-ins are exempt.
 */
class CheckSessionTimeout
{
    /** Session key: whether this sign-in was made with "remember me" ticked. */
    public const REMEMBERED = '_sec_remembered';

    /** Header the SPA sets on requests it makes by itself (polling), which are not activity. */
    public const BACKGROUND_HEADER = 'X-Background-Poll';

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

        $lastActivity = $session->get('_sec_last_activity');
        $now = time();

        if ($lastActivity !== null && ($now - $lastActivity) > ($minutes * 60)) {
            // Invalidating is the logout for cookie SPA auth; the sanctum guard's logout() would throw
            $session->invalidate();
            $session->regenerateToken();

            return response()->json(['message' => 'session_expired'], 401);
        }

        // Polling must not keep an idle session alive; it only starts a clock that has not started
        if ($lastActivity === null || $request->header(self::BACKGROUND_HEADER) !== '1') {
            $session->put('_sec_last_activity', $now);
        }

        return $next($request);
    }
}
