<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\User;
use App\Services\Auth\CurrentDevice;
use App\Services\Auth\DeviceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

// Remember-me per device: each browser's cookie is checked against its own user_devices row, never users.remember_token.
class DeviceRememberTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    /** @param  array<string, mixed>  $attributes */
    private function rememberedDevice(User $user, string $token, array $attributes = []): UserDevice
    {
        return UserDevice::factory()->for($user)->remembered()->create([
            'remember_token_hash' => hash('sha256', $token),
            ...$attributes,
        ]);
    }

    /** The recaller cookie value the guard would issue for this token. */
    private function cookieFor(User $user, string $token): string
    {
        return $user->id.'|'.$token.'|'.$user->getAuthPassword();
    }

    /** A different browser: no guard user, no request-scoped device, no session or cookies from the previous request. */
    private function freshBrowser(): void
    {
        Auth::forgetGuards();
        $this->app->forgetScopedInstances();
        $this->flushSession();
        $this->defaultCookies = [];
    }

    /** The same browser again, on its session cookie. */
    private function inSession(string $sessionId): static
    {
        $this->freshBrowser();

        return $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(config('session.cookie'), $sessionId);
    }

    private function withRememberCookie(string $cookie): static
    {
        $this->freshBrowser();

        return $this->withHeader('Origin', self::ORIGIN)
            ->withCredentials()
            ->withCookie(Auth::guard('web')->getRecallerName(), $cookie);
    }

    private function meWithCookie(string $cookie): TestResponse
    {
        return $this->withRememberCookie($cookie)->getJson('/api/me');
    }

    public function test_two_remembered_devices_have_their_own_cookies(): void
    {
        $user = User::factory()->create();
        $usersToken = $user->getRememberToken();
        $laptop = $this->rememberedDevice($user, 'laptop-token');
        $this->rememberedDevice($user, 'phone-token');

        $this->meWithCookie($this->cookieFor($user, 'laptop-token'))->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertTrue($laptop->is($this->app->make(CurrentDevice::class)->get()));
        $this->meWithCookie($this->cookieFor($user, 'phone-token'))->assertOk()->assertJsonPath('data.remembered', true);

        $this->app->make(DeviceService::class)->end($laptop, DeviceEndReason::Profile);

        $this->meWithCookie($this->cookieFor($user, 'laptop-token'))->assertUnauthorized();
        $this->meWithCookie($this->cookieFor($user, 'phone-token'))->assertOk();
        // Ending a device also retires the cookie from before devices; a device token never lands there
        $this->assertNotContains($user->fresh()->getRememberToken(), [$usersToken, 'laptop-token', 'phone-token']);
    }

    public function test_an_ended_device_cookie_never_signs_in_again(): void
    {
        $user = User::factory()->create();
        $kicked = $this->rememberedDevice($user, 'kicked-token');
        $this->app->make(DeviceService::class)->end($kicked, DeviceEndReason::ThirdDevice);
        $this->rememberedDevice($user, 'ended-with-hash-token', ['ended_at' => now(), 'end_reason' => DeviceEndReason::Limit, 'session_id' => null]);
        $this->rememberedDevice($user, 'expired-token', ['remember_expires_at' => now()->subMinute()]);
        $devices = UserDevice::count();
        $events = LoginEvent::count();

        foreach (['kicked-token', 'ended-with-hash-token', 'expired-token'] as $token) {
            $this->meWithCookie($this->cookieFor($user, $token))->assertUnauthorized();
            $this->assertNull($this->app->make(CurrentDevice::class)->get(), $token);
        }

        $this->assertSame($devices, UserDevice::count());
        $this->assertSame($events, LoginEvent::count());
        $this->assertSame(0, UserDevice::active()->where('user_id', $user->id)->count());
    }

    public function test_a_legacy_user_token_cookie_still_signs_in_once(): void
    {
        $user = User::factory()->create(['remember_token' => 'token-from-before-devices']);

        $this->meWithCookie($this->cookieFor($user, 'token-from-before-devices'))
            ->assertOk()
            ->assertJsonPath('data.remembered', true);

        $this->assertNotNull(UserDevice::query()->sole()->remember_token_hash);
        $this->assertNotSame('token-from-before-devices', $user->fresh()->getRememberToken());

        $this->meWithCookie($this->cookieFor($user, 'token-from-before-devices'))->assertUnauthorized();
        $this->meWithCookie($this->cookieFor($user, 'a-guessed-token'))->assertUnauthorized();
    }

    public function test_logout_clears_only_this_devices_token(): void
    {
        $user = User::factory()->create();
        $usersToken = $user->getRememberToken();
        $laptop = $this->rememberedDevice($user, 'laptop-token');
        $phone = $this->rememberedDevice($user, 'phone-token');

        $this->withRememberCookie($this->cookieFor($user, 'laptop-token'))->postJson('/api/logout')->assertOk();

        $this->assertNull($laptop->fresh()->remember_token_hash);
        $this->assertSame(DeviceEndReason::SignedOut, $laptop->fresh()->end_reason);
        $this->assertSame(hash('sha256', 'phone-token'), $phone->fresh()->remember_token_hash);
        $this->assertNotContains($user->fresh()->getRememberToken(), [$usersToken, 'laptop-token', 'phone-token']);

        $this->meWithCookie($this->cookieFor($user, 'laptop-token'))->assertUnauthorized();
        $this->meWithCookie($this->cookieFor($user, 'phone-token'))->assertOk();
    }

    public function test_a_device_token_never_reaches_the_users_table(): void
    {
        $user = User::factory()->create();
        $usersToken = $user->getRememberToken();
        $this->rememberedDevice($user, 'laptop-token');

        $this->withRememberCookie($this->cookieFor($user, 'laptop-token'))
            ->putJson('/api/preferences', ['dark' => true])
            ->assertOk();

        $this->assertSame($usersToken, $user->fresh()->getRememberToken());
    }

    public function test_an_issued_token_never_reaches_the_users_table(): void
    {
        $user = User::factory()->create(['password_changed_at' => null]);
        $usersToken = $user->remember_token;
        $devices = $this->app->make(DeviceService::class);

        $token = $devices->issueRememberToken($user);
        $user->forceFill(['password_changed_at' => now()])->saveQuietly();

        $this->assertSame(60, strlen($token));
        $this->assertSame($token, $user->getRememberToken());
        $this->assertSame($usersToken, $user->fresh()->remember_token);

        $request = Request::create('/api/login', 'POST', [], [], [], ['REMOTE_ADDR' => '203.0.113.5', 'HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0']);
        $request->setLaravelSession($this->app['session.store']);
        $device = $devices->start($user, $request, $token);
        $devices->end($device, DeviceEndReason::ThirdDevice);
        $deviceCount = UserDevice::count();

        $this->meWithCookie($this->cookieFor($user, $token))->assertUnauthorized();
        $this->assertSame($deviceCount, UserDevice::count());
        $this->assertNotContains($user->fresh()->remember_token, [$usersToken, $token]);
    }

    public function test_signing_in_with_remember_never_writes_the_users_token(): void
    {
        $user = User::factory()->create(['remember_token' => null, 'password_changed_at' => null]);

        $this->withHeader('Origin', self::ORIGIN)
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password', 'remember' => true])
            ->assertOk();

        $this->assertNull($user->fresh()->remember_token);
    }

    public function test_changing_the_password_gives_this_remembered_device_a_new_cookie(): void
    {
        $user = User::factory()->create();
        $recaller = Auth::guard('web')->getRecallerName();
        $oldCookie = $this->inSession(Str::random(40))
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password', 'remember' => true])
            ->assertOk()
            ->getCookie($recaller)->getValue();
        $device = UserDevice::query()->sole();

        $newCookie = $this->inSession(session()->getId())
            ->putJson('/api/password', ['current_password' => 'password', 'password' => 'N3w-Passw0rd!', 'password_confirmation' => 'N3w-Passw0rd!'])
            ->assertOk()
            ->getCookie($recaller)->getValue();

        $device->refresh();
        $this->assertNull($device->ended_at);
        $this->assertSame(session()->getId(), $device->session_id);
        $this->assertSame(hash('sha256', explode('|', $newCookie)[1]), $device->remember_token_hash);
        $this->assertSame(1, UserDevice::count());
        $this->assertNotSame(explode('|', $newCookie)[1], $user->fresh()->getRememberToken());

        $this->meWithCookie($oldCookie)->assertUnauthorized();
        $this->meWithCookie($newCookie)->assertOk()->assertJsonPath('data.remembered', true);
    }

    /** Not remembered: the session gets a new id, a copy of the old session cookie is signed out, and the device follows. */
    public function test_changing_the_password_moves_this_session_to_a_new_id(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $this->inSession(Str::random(40))
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk();
        $oldSessionId = session()->getId();
        $device = UserDevice::query()->sole();

        $response = $this->inSession($oldSessionId)
            ->putJson('/api/password', ['current_password' => 'password', 'password' => 'N3w-Passw0rd!', 'password_confirmation' => 'N3w-Passw0rd!'])
            ->assertOk();
        $newSessionId = $response->getCookie(config('session.cookie'))->getValue();

        $this->assertNotSame($oldSessionId, $newSessionId);
        $device->refresh();
        $this->assertNull($device->ended_at);
        $this->assertSame($newSessionId, $device->session_id);
        $this->assertDatabaseMissing('sessions', ['id' => $oldSessionId]);

        $this->inSession($oldSessionId)->getJson('/api/me')->assertUnauthorized();
        $this->inSession($newSessionId)->getJson('/api/me')->assertOk();
    }

    public function test_logout_retires_a_cookie_from_before_devices(): void
    {
        $user = User::factory()->create(['remember_token' => 'token-from-before-devices']);
        $legacy = $this->cookieFor($user, 'token-from-before-devices');

        $this->withRememberCookie($legacy)->postJson('/api/logout')->assertOk();

        $this->meWithCookie($legacy)->assertUnauthorized();
        $this->assertNotNull($user->fresh()->getRememberToken());
        $this->assertNotSame('token-from-before-devices', $user->fresh()->getRememberToken());
    }
}
