<?php

namespace App\Http\Middleware;

use App\Models\AppSetting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckSessionTimeout
{
    /**
     * Enforce inactivity-based session timeout on top of Laravel's session.
     * Tracks the last activity timestamp in the session under "_sec_last_activity".
     * Returns 401 with message "session_expired" so the frontend can redirect to login.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $minutes = (int) AppSetting::get('session_timeout_minutes', '0');

        // Only applies to session-backed (SPA cookie) requests. Token/API calls
        // without a session — and requests when the policy is off — pass through.
        if ($minutes <= 0 || ! $request->user() || ! $request->hasSession()) {
            return $next($request);
        }

        $session = $request->session();
        $lastActivity = $session->get('_sec_last_activity');
        $now = time();

        if ($lastActivity !== null && ($now - $lastActivity) > ($minutes * 60)) {
            // Invalidating the session is the logout for cookie-based SPA auth —
            // the user is re-read from the session on every request. (Calling the
            // default sanctum guard's logout() would throw; this is guard-agnostic.)
            $session->invalidate();
            $session->regenerateToken();

            return response()->json(['message' => 'session_expired'], 401);
        }

        $session->put('_sec_last_activity', $now);

        return $next($request);
    }
}
