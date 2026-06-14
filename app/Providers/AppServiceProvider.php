<?php

namespace App\Providers;

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

        Relation::enforceMorphMap([
            'email_group' => \App\Models\EmailGroup::class,
            'file_share' => \App\Models\FileShare::class,
            'social_platform' => \App\Models\SocialPlatform::class,
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
