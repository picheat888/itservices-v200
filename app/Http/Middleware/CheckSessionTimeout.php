<?php

namespace App\Http\Middleware;

use App\Models\AppSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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

        if ($minutes <= 0 || ! $request->user()) {
            return $next($request);
        }

        $lastActivity = $request->session()->get('_sec_last_activity');
        $now = time();

        if ($lastActivity !== null && ($now - $lastActivity) > ($minutes * 60)) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['message' => 'session_expired'], 401);
        }

        $request->session()->put('_sec_last_activity', $now);

        return $next($request);
    }
}
