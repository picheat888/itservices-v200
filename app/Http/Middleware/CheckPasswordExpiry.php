<?php

namespace App\Http\Middleware;

use App\Models\AppSetting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPasswordExpiry
{
    /**
     * Reject authenticated requests when the user's password has exceeded the
     * configured expiry period. Returns 403 with message "password_expired" so
     * the frontend can redirect the user to the change-password flow.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $days = (int) AppSetting::get('password_expiry_days', '0');

        if ($days <= 0 || ! $request->user()) {
            return $next($request);
        }

        $changedAt = $request->user()->password_changed_at;

        // Treat "never changed" as expired when policy is enabled.
        $isExpired = $changedAt === null || $changedAt->addDays($days)->isPast();

        if ($isExpired) {
            return response()->json(['message' => 'password_expired'], 403);
        }

        return $next($request);
    }
}
