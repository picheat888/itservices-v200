<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Employee\EmployeeStatus;
use App\Http\Middleware\CheckSessionTimeout;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

// TrackDevice: every signed-in request checks its device, an ended device learns why, and only real use moves last_active_at.
class TrackDeviceTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    /** The SPA of a signed-in browser whose session (kept by its cookie) belongs to $device. */
    private function onDevice(UserDevice $device, ?string $sessionId = null): static
    {
        return $this->actingAs($device->user)
            ->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(config('session.cookie'), $sessionId ?? $device->session_id)
            ->withSession([DeviceService::SESSION_KEY => $device->id]);
    }

    /** A different browser: no guard user, no request-scoped device, no session or cookies from the previous request. */
    private function freshBrowser(): void
    {
        Auth::forgetGuards();
        $this->app->forgetScopedInstances();
        $this->flushSession();
        $this->defaultCookies = [];
    }

    /** The same browser again, on its session cookie only. */
    private function inSession(string $sessionId): static
    {
        $this->freshBrowser();

        return $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(config('session.cookie'), $sessionId);
    }

    private function meWithRememberCookie(string $cookie): TestResponse
    {
        $this->freshBrowser();

        return $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(Auth::guard('web')->getRecallerName(), $cookie)
            ->getJson('/api/me');
    }

    /** The recaller cookie value the guard would issue for this token. */
    private function cookieFor(User $user, string $token): string
    {
        return $user->id.'|'.$token.'|'.$user->getAuthPassword();
    }

    private function rememberedDevice(User $user, string $token): UserDevice
    {
        return UserDevice::factory()->for($user)->remembered()->create(['remember_token_hash' => hash('sha256', $token)]);
    }

    /** @return array{os: string, browser: string, location: string, at: string} */
    private function newcomer(): array
    {
        return ['os' => 'macOS', 'browser' => 'Safari', 'location' => 'Head office', 'at' => now()->toIso8601String()];
    }

    private function devices(): DeviceService
    {
        return $this->app->make(DeviceService::class);
    }

    public function test_an_ended_device_gets_401_with_its_reason_and_the_session_ends(): void
    {
        $device = UserDevice::factory()->create();
        $sessionId = $device->session_id;
        $this->onDevice($device)->getJson('/api/me')->assertOk();

        $this->devices()->end($device, DeviceEndReason::Profile);

        $this->onDevice($device, $sessionId)
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'device_signed_out', 'reason' => 'profile', 'by' => null]);

        $this->assertFalse(session()->has(DeviceService::SESSION_KEY));
        $this->assertNotSame($sessionId, session()->getId());
    }

    public function test_the_third_device_reason_carries_who_took_the_place(): void
    {
        $device = UserDevice::factory()->create();
        $sessionId = $device->session_id;
        $newcomer = $this->newcomer();
        $this->devices()->end($device, DeviceEndReason::ThirdDevice, $newcomer);

        $this->onDevice($device, $sessionId)
            ->getJson('/api/notifications')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'device_signed_out', 'reason' => 'third_device', 'by' => $newcomer]);
    }

    public function test_a_device_ended_without_a_service_call_is_refused_too(): void
    {
        $device = UserDevice::factory()->ended(DeviceEndReason::Limit)->create();

        $this->onDevice($device, Str::random(40))
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('reason', 'limit');
    }

    public function test_a_poll_does_not_count_as_use(): void
    {
        $device = UserDevice::factory()->create(['last_active_at' => now()->subMinutes(10)]);
        $lastUse = $device->last_active_at->getTimestamp();

        $this->onDevice($device)->getJson('/api/notifications')->assertOk();
        $this->onDevice($device)->getJson('/api/me')->assertOk();

        $this->assertSame($lastUse, $device->fresh()->last_active_at->getTimestamp());
    }

    public function test_a_write_and_the_ping_count_as_use(): void
    {
        $device = UserDevice::factory()->create(['last_active_at' => now()->subMinutes(10)]);

        $this->onDevice($device)->putJson('/api/preferences', ['dark' => true])->assertOk();
        $this->assertGreaterThanOrEqual(now()->subSeconds(5)->getTimestamp(), $device->fresh()->last_active_at->getTimestamp());

        $this->travel(10)->minutes();
        $this->onDevice($device)->getJson('/api/session/ping')->assertOk();
        $this->assertGreaterThanOrEqual(now()->subSeconds(5)->getTimestamp(), $device->fresh()->last_active_at->getTimestamp());
    }

    public function test_use_is_written_at_most_once_a_minute(): void
    {
        $device = UserDevice::factory()->create(['last_active_at' => now()->subSeconds(30)]);
        $lastUse = $device->last_active_at->getTimestamp();

        $this->onDevice($device)->putJson('/api/preferences', ['dark' => true])->assertOk();
        $this->assertSame($lastUse, $device->fresh()->last_active_at->getTimestamp());

        $this->travel(31)->seconds();
        $this->onDevice($device)->putJson('/api/preferences', ['dark' => false])->assertOk();
        $this->assertSame(now()->getTimestamp(), $device->fresh()->last_active_at->getTimestamp());
    }

    public function test_a_warm_request_does_not_query_the_device(): void
    {
        $device = UserDevice::factory()->create();
        $this->onDevice($device)->getJson('/api/me')->assertOk();

        $deviceQueries = 0;
        DB::listen(function ($query) use (&$deviceQueries) {
            if (str_contains($query->sql, 'user_devices')) {
                $deviceQueries++;
            }
        });
        $this->onDevice($device)->getJson('/api/me')->assertOk();
        $this->onDevice($device)->getJson('/api/notifications')->assertOk();

        $this->assertSame(0, $deviceQueries);
    }

    public function test_a_session_from_before_the_deploy_gets_a_device_without_an_event(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->withHeader('Origin', self::ORIGIN)->getJson('/api/me')->assertOk();

        $device = UserDevice::query()->sole();
        $this->assertSame($user->id, $device->user_id);
        $this->assertSame(session()->getId(), $device->session_id);
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
        $this->assertNull($device->remember_token_hash);
        $this->assertSame(0, LoginEvent::count());

        $this->actingAs($user)->withHeader('Origin', self::ORIGIN)->getJson('/api/me')->assertOk();
        $this->assertSame(1, UserDevice::count());
    }

    /** The session's id was saved by a request that ran before the first one stored the device. */
    public function test_requests_fired_together_on_a_session_from_before_the_deploy_share_one_device(): void
    {
        $device = UserDevice::factory()->create();

        $this->actingAs($device->user)
            ->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(config('session.cookie'), $device->session_id)
            ->getJson('/api/me')
            ->assertOk();

        $this->assertSame(1, UserDevice::count());
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
    }

    /** A browser from before devices was trimmed while its legacy remember cookie still matches the account. */
    public function test_a_remember_cookie_does_not_bring_back_a_browser_whose_session_was_ended(): void
    {
        $user = User::factory()->create(['remember_token' => 'token-from-before-devices']);
        $device = UserDevice::factory()->for($user)->create();
        $sessionId = $device->session_id;
        $this->devices()->end($device, DeviceEndReason::Limit);
        $recaller = Auth::guard('web')->getRecallerName();

        $response = $this->inSession($sessionId)
            ->withCookie($recaller, $this->cookieFor($user, 'token-from-before-devices'))
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'device_signed_out')
            ->assertJsonPath('reason', 'limit');

        $this->assertTrue($response->getCookie($recaller, false)->isCleared());
        $this->assertSame(1, UserDevice::count());
        $this->assertSame(0, LoginEvent::query()->where('event', 'signed_in')->count());
    }

    public function test_idle_timeout_ends_the_device(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        Cache::put(CheckSessionTimeout::clockKey('test-clock'), time() - 40 * 60, 3600);
        $device = UserDevice::factory()->create();

        $this->onDevice($device)
            ->withSession([CheckSessionTimeout::IDLE_CLOCK => 'test-clock'])
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'session_expired');

        $device->refresh();
        $this->assertNotNull($device->ended_at);
        $this->assertSame(DeviceEndReason::IdleTimeout, $device->end_reason);
        $this->assertDatabaseHas('login_events', ['event' => 'forced_out', 'reason' => 'idle_timeout', 'device_id' => $device->id]);
    }

    public function test_a_closed_account_ends_the_device(): void
    {
        $employee = Employee::create(['first_name' => 'Leaver', 'status' => EmployeeStatus::Resigned, 'last_day' => now()->subWeek()->toDateString()]);
        $user = User::factory()->create(['employee_id' => $employee->id]);
        $device = UserDevice::factory()->for($user)->create();

        $this->onDevice($device)->getJson('/api/me')->assertUnauthorized()->assertJsonPath('message', 'account_closed');

        $this->assertSame(DeviceEndReason::AccountClosed, $device->fresh()->end_reason);
    }

    public function test_web_file_routes_are_tracked_too(): void
    {
        $employee = Employee::create(['first_name' => 'Photo', 'photo_path' => 'employees/photo.jpg']);
        $device = UserDevice::factory()->ended(DeviceEndReason::Profile)->create();
        $sessionId = Str::random(40);
        $url = "/files/employees/{$employee->id}/photo";

        $this->onDevice($device, $sessionId)->get($url)->assertRedirect('/login?reason=profile');

        // The SPA's next request still learns why
        $this->onDevice($device, $sessionId)
            ->getJson('/api/notifications')
            ->assertUnauthorized()
            ->assertJsonPath('reason', 'profile');
    }

    /** With database sessions, ending a device deletes its session row; the browser still learns why on its next request. */
    public function test_an_ended_device_learns_why_after_its_session_row_is_gone(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $this->withHeader('Origin', self::ORIGIN)
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk();
        $sessionId = session()->getId();
        $newcomer = $this->newcomer();
        $this->assertDatabaseHas('sessions', ['id' => $sessionId, 'user_id' => $user->id]);

        $this->devices()->end(UserDevice::query()->sole(), DeviceEndReason::ThirdDevice, $newcomer);
        $this->assertDatabaseMissing('sessions', ['id' => $sessionId]);

        // An image or file link goes to the login page and leaves the reason for the SPA's next request
        $nextSessionId = $this->inSession($sessionId)
            ->get('/files/employees/1/photo')
            ->assertRedirect('/login?reason=third_device')
            ->getCookie(config('session.cookie'))
            ->getValue();
        $this->inSession($nextSessionId)
            ->getJson('/api/notifications')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'device_signed_out', 'reason' => 'third_device', 'by' => $newcomer]);

        // A browser that was never signed out gets the usual guest answers
        $this->inSession(Str::random(40))->getJson('/api/notifications')->assertUnauthorized()->assertJsonPath('message', 'Unauthenticated.');
        $this->inSession(Str::random(40))->get('/files/employees/1/photo')->assertRedirect('/login?next='.rawurlencode('/files/employees/1/photo'));
    }

    public function test_a_remember_cookie_moves_its_device_to_the_new_session_and_records_the_sign_in(): void
    {
        $user = User::factory()->create();
        $device = $this->rememberedDevice($user, 'laptop-token');

        $this->meWithRememberCookie($this->cookieFor($user, 'laptop-token'))->assertOk();

        $device->refresh();
        $this->assertSame(session()->getId(), $device->session_id);
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
        $this->assertSame(1, UserDevice::count());
        $this->assertSame(1, LoginEvent::query()->where(['event' => 'signed_in', 'remembered' => true, 'device_id' => $device->id])->count());
    }

    public function test_requests_fired_together_after_a_wake_up_record_one_sign_in(): void
    {
        $user = User::factory()->create();
        $device = $this->rememberedDevice($user, 'laptop-token');

        $this->meWithRememberCookie($this->cookieFor($user, 'laptop-token'))->assertOk();
        $this->meWithRememberCookie($this->cookieFor($user, 'laptop-token'))->assertOk();

        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
        $this->assertSame(1, UserDevice::count());
        $this->assertSame(1, LoginEvent::query()->where('event', 'signed_in')->count());
    }

    public function test_a_cookie_from_before_devices_moves_to_a_device_token_once(): void
    {
        $user = User::factory()->create(['remember_token' => 'token-from-before-devices']);
        $legacy = $this->cookieFor($user, 'token-from-before-devices');
        $recaller = Auth::guard('web')->getRecallerName();

        $response = $this->meWithRememberCookie($legacy)->assertOk()->assertJsonPath('data.remembered', true);

        $device = UserDevice::query()->sole();
        [$userId, $token] = explode('|', $response->getCookie($recaller)->getValue(), 3);
        $this->assertSame((string) $user->id, $userId);
        $this->assertSame(hash('sha256', $token), $device->remember_token_hash);
        $this->assertNotNull($device->remember_expires_at);
        $this->assertSame(session()->getId(), $device->session_id);
        $days = ($response->getCookie($recaller, false)->getExpiresTime() - time()) / 86400;
        $this->assertEqualsWithDelta(7, $days, 0.01);
        $this->assertDatabaseHas('login_events', ['event' => 'signed_in', 'remembered' => true, 'device_id' => $device->id]);
        $this->assertNotContains($user->fresh()->getRememberToken(), ['token-from-before-devices', $token]);

        $this->meWithRememberCookie($legacy)->assertUnauthorized();
        $this->meWithRememberCookie($this->cookieFor($user, $token))->assertOk();
        $this->assertSame(1, UserDevice::count());
    }

    /** A request that passed the old cookie's check before the first one retired it joins that device instead of making another. */
    public function test_requests_fired_together_with_an_old_cookie_share_one_device(): void
    {
        $user = User::factory()->create(['remember_token' => 'token-from-before-devices']);
        $legacy = $this->cookieFor($user, 'token-from-before-devices');
        $this->meWithRememberCookie($legacy)->assertOk();
        $device = UserDevice::query()->sole();
        User::query()->whereKey($user->id)->update(['remember_token' => 'token-from-before-devices']);

        $this->meWithRememberCookie($legacy)->assertOk();

        $this->assertSame(1, UserDevice::count());
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
    }

    public function test_a_remembered_device_past_its_remember_period_carries_on_as_a_session_device(): void
    {
        $device = UserDevice::factory()->remembered()->create(['remember_expires_at' => now()->subMinute()]);

        $this->onDevice($device)->getJson('/api/me')->assertOk();

        $device->refresh();
        $this->assertNull($device->remember_token_hash);
        $this->assertNull($device->remember_expires_at);
        $this->assertNull($device->ended_at);
        $this->assertTrue(UserDevice::query()->active()->whereKey($device->id)->exists());
    }

    public function test_a_session_pointing_at_another_accounts_device_gets_its_own(): void
    {
        $device = UserDevice::factory()->create();
        $other = User::factory()->create();

        $this->actingAs($other)
            ->withHeader('Origin', self::ORIGIN)
            ->withSession([DeviceService::SESSION_KEY => $device->id])
            ->getJson('/api/me')
            ->assertOk();

        $this->assertNull($device->fresh()->ended_at);
        $this->assertSame(1, UserDevice::query()->where('user_id', $other->id)->count());
    }

    public function test_a_token_client_without_a_session_is_left_alone(): void
    {
        $this->actingAs(User::factory()->create())->getJson('/api/me')->assertOk();

        $this->assertSame(0, UserDevice::count());
    }
}
