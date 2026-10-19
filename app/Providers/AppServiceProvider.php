<?php

namespace App\Providers;

use App\Jobs\SendScheduledReport;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\CurrentDevice;
use App\Services\Auth\DbIpLookup;
use App\Services\Auth\DeviceUserProvider;
use App\Services\Auth\GeoIpLookup;
use App\Support\ErrorPage;
use App\Support\NotificationKind;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;
use Illuminate\View\View as BladeView;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(GeoIpLookup::class, DbIpLookup::class);
        $this->app->scoped(CurrentDevice::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Settings cache per application instance (one request, one test)
        AppSetting::flushCache();
        // A long-lived queue worker boots once; each job reads settings fresh.
        Event::listen(JobProcessing::class, fn () => AppSetting::flushCache());

        $this->configureRateLimiting();

        // Remember-me tokens per device
        Auth::provider('devices', fn ($app, array $config) => new DeviceUserProvider($app['hash'], $config['model']));

        // Each bell row carries its kind, so the tray counts and pages in SQL.
        DatabaseNotification::creating(function (DatabaseNotification $notification) {
            $notification->kind = NotificationKind::of((array) $notification->data);
        });

        // Strict morph map: every polymorphic model must be listed, User keyed by its class name
        Relation::enforceMorphMap([
            'email_group' => EmailGroup::class,
            'file_share' => FileShare::class,
            'social_platform' => SocialPlatform::class,
            'software' => Software::class,
            User::class => User::class,
        ]);

        // Blade error pages: words, buttons, brand and accent (no queries in the view)
        View::composer('errors.layout', fn (BladeView $view) => $view->with('page', ErrorPage::for(
            $view->getData()['code'],
            request(),
            $view->getData()['exception'] ?? null,
        )));
    }

    /** API throttle 300/min per user (client IP when signed out), plus the named limiters below. */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(300)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('client-errors', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));

        // Sign-in per IP: a whole office shares one public IP
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(50)->by($request->ip())->response(self::tooManySignIns(...)));
        RateLimiter::for('login-pending', fn (Request $request) => [
            Limit::perMinute(10)->by(self::pendingTokenKey($request))->response(self::tooManySignIns(...)),
            Limit::perMinute(50)->by($request->ip())->response(self::tooManySignIns(...)),
        ]);

        // Scheduled report mails: a backlog goes out one run per minute
        RateLimiter::for(SendScheduledReport::LIMITER, fn () => Limit::perMinute(1));
    }

    /** One device-limit dialog: the IP plus a hash of its pending token (body field `pending`); the IP alone when there is none. */
    private static function pendingTokenKey(Request $request): string
    {
        $token = $request->input('pending');

        return $request->ip().'|'.(is_string($token) && $token !== '' ? sha1($token) : '');
    }

    /** @param  array<string, int|string>  $headers */
    private static function tooManySignIns(Request $request, array $headers): JsonResponse
    {
        return response()->json([
            'message' => 'too_many_attempts',
            'retry_after' => (int) ($headers['Retry-After'] ?? 0),
        ], 429, $headers);
    }
}
