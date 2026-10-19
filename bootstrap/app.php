<?php

use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\CheckSessionTimeout;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\SetRequestLocale;
use App\Http\Middleware\TrackDevice;
use App\Support\DatabaseBusy;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

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
        // The idle and device checks run right after sign-in, before route bindings and throttles
        $middleware->appendToPriorityList(AuthenticatesRequests::class, CheckSessionTimeout::class);
        $middleware->appendToPriorityList(CheckSessionTimeout::class, TrackDevice::class);
        // A signed-out browser opening a file link (e.g. from an email) signs in, then comes back to it.
        $middleware->redirectGuestsTo(fn (Request $request) => '/login?next='.rawurlencode($request->getRequestUri()));
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // A browser whose device was ended elsewhere has lost its session row; it still learns why
        $exceptions->render(fn (AuthenticationException $e, Request $request) => TrackDevice::answerLostSession($request));
        // A full or unreachable database asks the reader to wait (503 + Retry-After); the QueryException is still logged
        $exceptions->render(function (QueryException $e, Request $request) {
            if (! DatabaseBusy::is($e)) {
                return null;
            }
            $headers = ['Retry-After' => (string) DatabaseBusy::RETRY_AFTER];
            if ($request->expectsJson()) {
                return response()->json(['message' => DatabaseBusy::MESSAGE], 503, $headers);
            }

            return response()->view('errors.503', ['exception' => new HttpException(503, DatabaseBusy::MESSAGE, $e, $headers)], 503, $headers);
        });
    })->create();
