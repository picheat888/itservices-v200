<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    /**
     * Aborts with 403 unless the authenticated user holds the given permission key.
     * Super admins always pass (handled inside User::hasPermission()).
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        abort_unless((bool) $request->user()?->hasPermission($permission), 403);

        return $next($request);
    }
}
