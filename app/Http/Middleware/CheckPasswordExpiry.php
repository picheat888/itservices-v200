<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPasswordExpiry
{
    /**
     * 403 "password_expired" while the account owes a password change, so the SPA opens its change-password wall.
     * A browser tab (a file or PDF link) goes to the app, where the wall opens; never to /login?next=, which would send it straight back here.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // An admin-forced change applies whatever the policy; the expiry rule itself lives on the model
        if ($user?->must_change_password || $user?->isPasswordExpired()) {
            if (! $request->expectsJson()) {
                return redirect('/');
            }

            return response()->json(['message' => 'password_expired'], 403);
        }

        return $next($request);
    }
}
