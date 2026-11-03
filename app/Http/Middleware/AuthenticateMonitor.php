<?php

// Lets the paired monitor TV (X-Monitor-Token) or a signed-in user with tickets.view_all read the monitor board.

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
        $token = $request->header(self::HEADER);

        if ($token !== null) {
            if (! $this->pairing->deviceMatches($token)) {
                return $this->unpaired();
            }
            $this->pairing->touchLastSeen();

            return $next($request);
        }

        $user = $request->user('sanctum');
        if ($user === null) {
            return $this->unpaired();
        }
        abort_unless($user->hasPermission('tickets.view_all'), 403);

        return $next($request);
    }

    private function unpaired(): Response
    {
        return response()->json(['message' => 'monitor_unpaired'], 401);
    }
}
