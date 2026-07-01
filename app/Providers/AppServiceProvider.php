<?php

namespace App\Providers;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();

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
    }
}
