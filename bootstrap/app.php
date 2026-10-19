<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\SetRequestLocale;
use App\Http\Middleware\TrackDevice;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->prepend(AssignRequestId::class);
        // Cloudflare Tunnel runs on this machine, so only loopback may name the client IP.
        $middleware->trustProxies(at: ['127.0.0.1', '::1'], headers: Request::HEADER_X_FORWARDED_FOR);
        $middleware->statefulApi();
        // Apply the standard 'api' rate limiter (300/min, AppServiceProvider) to every API route.
        $middleware->api(append: ['throttle:api', SetRequestLocale::class]);
        $middleware->alias([
            'permission' => EnsurePermission::class,
        ]);
        // A signed-out browser opening a file link (e.g. from an email) signs in, then comes back to it.
        $middleware->redirectGuestsTo(fn (Request $request) => '/login?next='.rawurlencode($request->getRequestUri()));
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // A browser whose device was ended elsewhere has lost its session row; it still learns why
        $exceptions->render(fn (AuthenticationException $e, Request $request) => TrackDevice::answerLostSession($request));
    })->create();
