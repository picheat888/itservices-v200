<?php

// Lets only the paired monitor TV (X-Monitor-Token) read the board; signed-in viewers use /monitor/live inside the signed-in API.

namespace App\Http\Middleware;

use App\Services\Monitor\MonitorPairingService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateMonitor
{
    public const HEADER = 'X-Monitor-Token';

    public function __construct(private readonly MonitorPairingService $pairing) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->pairing->deviceMatches($request->header(self::HEADER))) {
            return response()->json(['message' => 'monitor_unpaired'], 401);
        }
        $this->pairing->touchLastSeen();

        return $next($request);
    }
}
