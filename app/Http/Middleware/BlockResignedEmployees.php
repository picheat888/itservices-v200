<?php

namespace App\Http\Middleware;

use App\Enums\Auth\DeviceEndReason;
use App\Services\Auth\DeviceService;
use App\Support\LoginRedirect;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Closes a signed-in session (and its device) the day after the person's last working day: 401 "account_closed", or the login page for a browser tab.
class BlockResignedEmployees
{
    public function __construct(private readonly DeviceService $devices) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // hasLeft(), not the raw status: the last day of a notice period is still a working day
        if ($user?->employee?->hasLeft() !== true) {
            return $next($request);
        }

        $device = $this->devices->currentOf($user, $request);
        if ($device !== null) {
            $this->devices->end($device, DeviceEndReason::AccountClosed);
        }

        // Invalidating the session is the logout for cookie SPA auth
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        if (! $request->expectsJson()) {
            return LoginRedirect::to($request, DeviceEndReason::AccountClosed->value);
        }

        return response()->json(['message' => 'account_closed'], 401);
    }
}
