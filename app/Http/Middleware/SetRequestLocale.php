<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Answers each API request in the language the reader has the SPA in.
 *
 * The SPA sends its UI language as `X-Locale` (th / en) on every call; validation, sign-in
 * and password messages then come from lang/<locale>/ instead of always from English
 * (APP_LOCALE stays the default for everything that sends nothing — artisan, queued mail,
 * the test suite). Anything other than a language the app ships is ignored.
 */
class SetRequestLocale
{
    /** Languages with a lang/<locale>/ folder. */
    private const SUPPORTED = ['th', 'en'];

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $locale = strtolower((string) $request->header('X-Locale'));
        if (in_array($locale, self::SUPPORTED, true)) {
            App::setLocale($locale);
        }

        return $next($request);
    }
}
