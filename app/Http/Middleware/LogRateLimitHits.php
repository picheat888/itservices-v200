<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

// Logs every 429 the app sends (who, from which IP, on which route) so the request limits can be tuned from real use.
class LogRateLimitHits
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response->getStatusCode() === Response::HTTP_TOO_MANY_REQUESTS) {
            Log::warning('Rate limit hit', [
                'user_id' => $request->user()?->getAuthIdentifier(),
                'ip' => $request->ip(),
                'route' => $request->route()?->getName(),
            ]);
        }

        return $response;
    }
}
