<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Closes the door on an account whose person has left.
 *
 * Resigning flips employees.status and nothing more — the login row survives, with the
 * role and every permission on it. LoginRequest refuses such an account at the door, but
 * a session opened BEFORE the last day kept answering until it happened to time out; this
 * reads Employee::hasLeft() on every request instead, so access ends the day after the
 * last working day even for somebody already signed in.
 *
 * Accounts with no employee record (the administrator the system ships with) are none of
 * this middleware's business: no directory record means nothing to resign.
 *
 * Answers 401 so the SPA's axios interceptor sends the browser to the login page, where
 * the sign-in attempt then explains that the account is closed.
 */
class BlockResignedEmployees
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // hasLeft(), not the raw status: somebody serving out a notice period is still
        // working here, and their last day is an ordinary working day.
        if ($request->user()?->employee?->hasLeft() !== true) {
            return $next($request);
        }

        // Invalidating the session is the logout for cookie-based SPA auth — the user is
        // re-read from the session on every request (same reason as CheckSessionTimeout).
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'account_closed'], 401);
    }
}
