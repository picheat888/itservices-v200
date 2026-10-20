<?php

namespace App\Support;

use App\Enums\Auth\DeviceEndReason;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

// Where a browser tab (a file or PDF link) goes when its sign-in has ended: the login page with why, and the link to reopen after signing in.
class LoginRedirect
{
    /** The login page with ?reason=, plus ?next= for a GET link; a closed account cannot sign in again, so it gets no next. */
    public static function to(Request $request, string $reason): RedirectResponse
    {
        $query = ['reason' => $reason];
        if ($request->isMethod('GET') && $reason !== DeviceEndReason::AccountClosed->value) {
            $query['next'] = $request->getRequestUri();
        }

        return redirect('/login?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986));
    }
}
