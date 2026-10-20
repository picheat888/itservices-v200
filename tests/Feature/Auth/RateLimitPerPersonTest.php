<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Mockery;
use Tests\TestCase;

// Request limits count per person: per account when signed in, per browser when signed out,
// so one person reloading on a shared office IP never locks a colleague out of signing in.
class RateLimitPerPersonTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private const BROWSER_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private const BROWSER_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    private const OFFICE_IP = '203.0.113.10';

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.timebox_duration' => 0]);
    }

    /** One signed-out browser: its own session cookie, on the office IP everyone shares. */
    private function browser(string $sessionId): static
    {
        Auth::forgetGuards();
        $this->app->forgetScopedInstances();
        $this->flushSession();

        return $this->withHeaders(['Origin' => self::ORIGIN])
            ->withCredentials()
            ->withCookie(config('session.cookie'), $sessionId)
            ->withServerVariables(['REMOTE_ADDR' => self::OFFICE_IP]);
    }

    /** @return list<Limit> */
    private function limitsFor(string $limiter, Request $request): array
    {
        $limits = RateLimiter::limiter($limiter)($request);

        return is_array($limits) ? $limits : [$limits];
    }

    public function test_a_browser_that_uses_up_the_api_budget_does_not_lock_out_a_colleague_on_the_same_ip(): void
    {
        $user = User::factory()->create();

        // The login page's own call; /api/me answers 401 before any limit counts it
        for ($i = 0; $i < 300; $i++) {
            $this->browser(self::BROWSER_A)->getJson('/api/settings')->assertOk();
        }
        $this->browser(self::BROWSER_A)->getJson('/api/settings')->assertStatus(429);

        $this->browser(self::BROWSER_B)->getJson('/api/settings')->assertOk();
        $this->browser(self::BROWSER_B)->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])->assertOk();
    }

    public function test_signing_in_is_not_counted_against_the_api_budget(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 300; $i++) {
            $this->browser(self::BROWSER_A)->getJson('/api/settings')->assertOk();
        }
        $this->browser(self::BROWSER_A)->getJson('/api/settings')->assertStatus(429);

        $this->browser(self::BROWSER_A)->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertHeader('X-RateLimit-Limit', 50);
        $this->assertNotContains('throttle:api', Route::getRoutes()->getByName('api.login.devices.sign-out')->gatherMiddleware());
    }

    public function test_reloading_the_page_locks_only_that_browser_and_is_logged(): void
    {
        $this->withoutVite();
        Log::spy();

        for ($i = 0; $i < 120; $i++) {
            $this->browser(self::BROWSER_A)->get('/login')->assertOk();
        }
        $this->browser(self::BROWSER_A)->get('/login')->assertStatus(429)->assertHeader('Retry-After');

        $this->browser(self::BROWSER_B)->get('/login')->assertOk();

        Log::shouldHaveReceived('warning')->once()->with('Rate limit hit', Mockery::on(
            fn (array $context) => $context['route'] === 'spa' && $context['ip'] === self::OFFICE_IP && $context['user_id'] === null,
        ));
    }

    public function test_a_sign_in_lockout_is_logged_too(): void
    {
        $user = User::factory()->create();
        Log::spy();

        for ($i = 0; $i < 5; $i++) {
            $this->browser(self::BROWSER_A)->postJson('/api/login', ['login' => $user->email, 'password' => 'wrong-password'])->assertStatus(422);
        }
        $this->browser(self::BROWSER_A)->postJson('/api/login', ['login' => $user->email, 'password' => 'wrong-password'])->assertStatus(429);

        Log::shouldHaveReceived('warning')->once()->with('Rate limit hit', Mockery::on(
            fn (array $context) => $context['route'] === 'api.login' && $context['ip'] === self::OFFICE_IP,
        ));
    }

    public function test_signed_out_browsers_share_only_a_high_ceiling_per_ip(): void
    {
        $request = Request::create('/api/me', 'GET', server: ['REMOTE_ADDR' => self::OFFICE_IP]);
        $session = $this->app['session']->driver();
        $session->setId(self::BROWSER_A);
        $request->setLaravelSession($session);

        [$browser, $ip] = $this->limitsFor('api', $request);

        $this->assertSame(300, $browser->maxAttempts);
        $this->assertSame('browser:'.self::BROWSER_A, $browser->key);
        $this->assertSame(AppServiceProvider::SIGNED_OUT_IP_PER_MINUTE, $ip->maxAttempts);
        $this->assertSame('ip:'.self::OFFICE_IP, $ip->key);

        [$noSession] = $this->limitsFor('api', Request::create('/api/me', 'GET', server: ['REMOTE_ADDR' => self::OFFICE_IP]));
        $this->assertSame('no-session:'.self::OFFICE_IP, $noSession->key);
    }

    public function test_pdfs_files_and_pages_each_have_their_own_limit_per_account(): void
    {
        $user = User::factory()->create();
        $request = Request::create('/pdf/stock-items/1/history');
        $request->setUserResolver(fn () => $user);

        foreach (['api' => 300, 'page' => 120, 'pdf' => 20, 'files' => 600] as $limiter => $perMinute) {
            $limits = $this->limitsFor($limiter, $request);
            $this->assertCount(1, $limits, $limiter);
            $this->assertSame($perMinute, $limits[0]->maxAttempts, $limiter);
            $this->assertSame('user:'.$user->id, $limits[0]->key, $limiter);
        }

        $this->assertContains('throttle:pdf', Route::getRoutes()->getByName('pdf.stock-items.history')->gatherMiddleware());
        $this->assertContains('throttle:files', Route::getRoutes()->getByName('files.employee-photo')->gatherMiddleware());
        $this->assertContains('throttle:page', Route::getRoutes()->getByName('spa')->gatherMiddleware());
    }
}
