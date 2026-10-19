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
use Illuminate\Support\ServiceProvider;

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
        // The settings cache lives exactly as long as one application instance.
        // In production that is one request; in the test suite it is one test, and
        // without this the rows one test wrote would answer the next one's reads
        // long after RefreshDatabase had rolled them away.
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

        // Strict morph map for Access Control resources. Because enforceMorphMap()
        // puts Eloquent into strict mode, EVERY model used in a polymorphic
        // relationship must be listed here — including User, which backs the
        // `notifiable` morph on Laravel's database notifications. Existing
        // notification rows store the User FQCN, so we key it by its class name
        // to keep both stored data and new writes resolving correctly.
        Relation::enforceMorphMap([
            'email_group' => EmailGroup::class,
            'file_share' => FileShare::class,
            'social_platform' => SocialPlatform::class,
            'software' => Software::class,
            User::class => User::class,
        ]);
    }

    /**
     * Standard API throttle: 300 requests/minute, keyed per authenticated user
     * (so one heavy user can't starve others) and falling back to the client IP
     * for unauthenticated calls. Exceeding it returns HTTP 429.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(300)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('client-errors', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));

        // Sign-in per IP: a whole office shares one public IP
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(50)->by($request->ip())->response(self::tooManySignIns(...)));
        RateLimiter::for('login-pending', fn (Request $request) => Limit::perMinute(10)->by($request->ip())->response(self::tooManySignIns(...)));

        // Scheduled report mails: a backlog goes out one run per minute
        RateLimiter::for(SendScheduledReport::LIMITER, fn () => Limit::perMinute(1));
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
