<?php

// Sign-in with the device limit: the 409 device list, the pending token, the login log rows and the sign-in throttles.

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Enums\Employee\EmployeeStatus;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Illuminate\Auth\Events\Login;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class LoginDeviceLimitTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private const BROWSER_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private const BROWSER_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    private const BROWSER_C = 'cccccccccccccccccccccccccccccccccccccccc';

    private const OFFICE_IP = '203.0.113.10';

    private const FIREFOX_ON_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

    protected function setUp(): void
    {
        parent::setUp();

        // Failed attempts without the timebox
        config(['session.lifetime' => 120, 'auth.timebox_duration' => 0]);
        AppSetting::put('device_limit', '2');
    }

    /** One browser: its own session cookie and IP, nobody signed in from an earlier request. */
    private function browser(string $sessionId, string $ip = self::OFFICE_IP): static
    {
        Auth::forgetGuards();
        $this->app->forgetScopedInstances();
        $this->flushSession();

        return $this->withHeaders(['Origin' => self::ORIGIN, 'User-Agent' => self::FIREFOX_ON_LINUX])
            ->withCredentials()
            ->withCookie(config('session.cookie'), $sessionId)
            ->withServerVariables(['REMOTE_ADDR' => $ip]);
    }

    /** @param  array<string, mixed>  $extra */
    private function signIn(User $user, string $sessionId = self::BROWSER_A, array $extra = []): TestResponse
    {
        return $this->browser($sessionId)->postJson('/api/login', ['login' => $user->email, 'password' => 'password', ...$extra]);
    }

    private function failSignIn(string $login, string $ip = self::OFFICE_IP): TestResponse
    {
        return $this->browser(self::BROWSER_A, $ip)->postJson('/api/login', ['login' => $login, 'password' => 'wrong-password']);
    }

    /** @param  array<string, mixed>  $extra */
    private function complete(string $pending, string $sessionId = self::BROWSER_A, array $extra = []): TestResponse
    {
        return $this->browser($sessionId)->postJson('/api/login', ['pending' => $pending, ...$extra]);
    }

    private function signOutDevice(int $deviceId, string $pending, string $sessionId = self::BROWSER_A): TestResponse
    {
        return $this->browser($sessionId)->postJson("/api/login/devices/{$deviceId}/sign-out", ['pending' => $pending]);
    }

    /** @return array{0: User, 1: UserDevice, 2: UserDevice} an account signed in on two machines: older, newer */
    private function fullAccount(): array
    {
        $user = User::factory()->create();
        $older = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinutes(5)]);
        $newer = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinute()]);

        return [$user, $older, $newer];
    }

    private function activeCount(User $user): int
    {
        return UserDevice::active()->where('user_id', $user->id)->count();
    }

    public function test_signing_in_under_the_limit_creates_a_device(): void
    {
        $user = User::factory()->create();
        UserDevice::factory()->for($user)->create();

        $this->signIn($user)->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonPath('message', 'success');

        $this->assertAuthenticatedAs($user);
        $this->assertSame(2, $this->activeCount($user));
        $device = UserDevice::query()->latest('id')->first();
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
        $this->assertSame(session()->getId(), $device->session_id);
        $this->assertSame(['Linux', 'Firefox', self::OFFICE_IP], [$device->os, $device->browser, $device->ip]);
        $this->assertSame(1, LoginEvent::query()->where('event', LoginEventType::SignedIn)->where('device_id', $device->id)->count());
    }

    public function test_a_full_account_gets_409_with_its_devices_and_no_session(): void
    {
        [$user, $older, $newer] = $this->fullAccount();

        $response = $this->signIn($user)
            ->assertStatus(409)
            ->assertJsonPath('message', 'device_limit')
            ->assertJsonPath('limit', 2)
            ->assertJsonPath('expires_in', 300)
            ->assertJsonCount(2, 'devices')
            ->assertJsonPath('devices.0.id', $newer->id)
            ->assertJsonPath('devices.1.id', $older->id)
            ->assertJsonPath('devices.0.current', false)
            ->assertJsonPath('devices.0.remembered', false)
            ->assertJsonStructure(['devices' => [[
                'id', 'os', 'browser', 'ip', 'location', 'signed_in_at', 'last_active_at', 'remembered', 'remember_expires_at', 'current',
            ]]]);

        $this->assertIsString($response->json('pending'));
        $this->assertSame(40, strlen($response->json('pending')));
        $this->assertGuest();
        $this->assertSame(self::BROWSER_A, session()->getId());
        $this->assertNull(session(DeviceService::SESSION_KEY));
        $this->assertSame(2, UserDevice::count());
        $this->assertSame(0, LoginEvent::query()->where('event', LoginEventType::SignedIn)->count());
    }

    public function test_signing_out_a_device_with_the_pending_token_frees_a_place(): void
    {
        [$user, $older] = $this->fullAccount();
        $pending = $this->signIn($user)->assertStatus(409)->json('pending');

        $this->signOutDevice($older->id, $pending)
            ->assertOk()
            ->assertJsonPath('message', 'success')
            ->assertJsonPath('data.id', $older->id)
            ->assertJsonPath('data.current', false);

        $older->refresh();
        $this->assertNotNull($older->ended_at);
        $this->assertSame(DeviceEndReason::ThirdDevice, $older->end_reason);
        $this->assertSame('Linux', $older->ended_by['os']);
        $this->assertSame('Firefox', $older->ended_by['browser']);
        $this->assertArrayHasKey('location', $older->ended_by);
        $this->assertNotEmpty($older->ended_by['at']);
        $this->assertSame(1, $this->activeCount($user));
        $this->assertTrue(LoginEvent::query()
            ->where('event', LoginEventType::ForcedOut)
            ->where('reason', DeviceEndReason::ThirdDevice)
            ->where('device_id', $older->id)
            ->exists());
        $this->assertGuest();
    }

    public function test_completing_with_the_token_signs_in_without_the_password(): void
    {
        [$user, $older] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');
        $this->signOutDevice($older->id, $pending)->assertOk();

        $response = $this->complete($pending, extra: ['remember' => true])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.remembered', true);

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($response->getCookie(Auth::guard('web')->getRecallerName(), false));
        $this->assertNotSame(self::BROWSER_A, session()->getId());
        $this->assertSame(2, $this->activeCount($user));
        $device = UserDevice::query()->latest('id')->first();
        $this->assertSame($device->id, session(DeviceService::SESSION_KEY));
        $this->assertNotNull($device->remember_token_hash);
        $this->assertSame(1, LoginEvent::query()->where('event', LoginEventType::SignedIn)->where('device_id', $device->id)->count());
    }

    public function test_the_limit_off_never_asks(): void
    {
        AppSetting::put('device_limit', '0');
        $user = User::factory()->create();

        foreach ([self::BROWSER_A, self::BROWSER_B, self::BROWSER_C] as $browser) {
            $this->signIn($user, $browser)->assertOk();
        }

        $this->assertSame(3, $this->activeCount($user));
    }

    public function test_an_expired_or_foreign_token_is_refused(): void
    {
        [$user, $older] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');

        $this->signOutDevice($older->id, $pending, self::BROWSER_B)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->complete($pending, self::BROWSER_B)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->assertGuest();
        $this->assertNull($older->fresh()->ended_at);
        $this->complete($pending)->assertStatus(409);

        $this->travel(6)->minutes();

        $this->signOutDevice($older->id, $pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->complete($pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->complete(Str::random(40))->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->assertGuest();
        $this->assertNull($older->fresh()->ended_at);
    }

    public function test_a_token_cannot_end_another_users_device(): void
    {
        [$user] = $this->fullAccount();
        $someoneElses = UserDevice::factory()->create();
        $alreadyEnded = UserDevice::factory()->for($user)->ended(DeviceEndReason::Profile)->create();
        $pending = $this->signIn($user)->json('pending');

        $this->signOutDevice($someoneElses->id, $pending)->assertNotFound();
        $this->signOutDevice($alreadyEnded->id, $pending)->assertNotFound();
        $this->signOutDevice($someoneElses->id + 1000, $pending)->assertNotFound();

        $this->assertTrue(UserDevice::active()->whereKey($someoneElses->id)->exists());
        $this->assertSame(DeviceEndReason::Profile, $alreadyEnded->fresh()->end_reason);
        $this->assertSame(0, LoginEvent::query()->where('event', LoginEventType::ForcedOut)->count());
    }

    public function test_a_used_token_cannot_be_reused(): void
    {
        [$user, $older, $newer] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');
        $this->signOutDevice($older->id, $pending)->assertOk();
        $this->complete($pending)->assertOk();

        $this->complete($pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->signOutDevice($newer->id, $pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');

        $this->assertNull($newer->fresh()->ended_at);
        $this->assertSame(2, $this->activeCount($user));
    }

    public function test_a_password_change_while_the_dialog_is_open_voids_the_token(): void
    {
        [$user, $older, $newer] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');
        $this->signOutDevice($older->id, $pending)->assertOk();

        // A password change alone voids the token
        $user->forceFill(['password' => Hash::make('N3w-Passw0rd!')])->save();

        $this->signOutDevice($newer->id, $pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->assertNull($newer->fresh()->ended_at);

        // An admin reset also signs every device out, leaving room to sign in
        $user->signOutEverywhere();

        $this->complete($pending)->assertForbidden()->assertJsonPath('message', 'pending_expired');
        $this->assertGuest();
        $this->assertSame(0, $this->activeCount($user));
    }

    public function test_completion_rechecks_a_lowered_limit(): void
    {
        [$user, $older, $newer] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');
        $this->signOutDevice($older->id, $pending)->assertOk();

        AppSetting::put('device_limit', '1');

        $this->complete($pending)
            ->assertStatus(409)
            ->assertJsonPath('message', 'device_limit')
            ->assertJsonPath('limit', 1)
            ->assertJsonPath('pending', $pending)
            ->assertJsonCount(1, 'devices')
            ->assertJsonPath('devices.0.id', $newer->id);

        $this->assertGuest();
        $this->assertSame(1, $this->activeCount($user));
    }

    public function test_two_completions_never_exceed_the_limit(): void
    {
        [$user, $older] = $this->fullAccount();
        $pendingA = $this->signIn($user, self::BROWSER_A)->assertStatus(409)->json('pending');
        $pendingB = $this->signIn($user, self::BROWSER_B)->assertStatus(409)->json('pending');
        $this->signOutDevice($older->id, $pendingA, self::BROWSER_A)->assertOk();

        $this->complete($pendingA, self::BROWSER_A)->assertOk();
        $deviceA = UserDevice::query()->latest('id')->first();

        $this->complete($pendingB, self::BROWSER_B)
            ->assertStatus(409)
            ->assertJsonPath('pending', $pendingB)
            ->assertJsonCount(2, 'devices')
            ->assertJsonPath('devices.0.id', $deviceA->id);

        $this->assertGuest();
        $this->assertSame(2, $this->activeCount($user));
    }

    public function test_an_account_closed_while_the_dialog_is_open_cannot_complete(): void
    {
        [$user, $older] = $this->fullAccount();
        $pending = $this->signIn($user)->json('pending');
        $this->signOutDevice($older->id, $pending)->assertOk();

        $employee = Employee::create(['first_name' => 'Gone', 'status' => EmployeeStatus::Resigned, 'last_day' => now()->subDay()->toDateString()]);
        $user->forceFill(['employee_id' => $employee->id])->save();

        $this->complete($pending)->assertForbidden()->assertJsonPath('message', 'account_closed');

        $this->assertGuest();
        $this->assertSame(1, $this->activeCount($user));
    }

    public function test_wrong_password_records_failed_and_the_fifth_records_locked(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->failSignIn($user->email)->assertStatus(422);
        }
        $this->failSignIn($user->email)->assertStatus(429);

        $failed = LoginEvent::query()->where('event', LoginEventType::Failed)->get();
        $this->assertCount(5, $failed);
        foreach ($failed as $event) {
            $this->assertSame([$user->id, $user->email, null], [$event->user_id, $event->login_name, $event->reason]);
        }
        $locked = LoginEvent::query()->where('event', LoginEventType::Locked)->sole();
        $this->assertSame([$user->id, null, self::OFFICE_IP], [$locked->user_id, $locked->reason, $locked->ip]);
        $this->assertSame(0, UserDevice::count());
    }

    public function test_an_unknown_username_records_failed_with_the_typed_name(): void
    {
        $this->failSignIn('Ghost.User')->assertStatus(422)->assertJsonValidationErrors('login');

        $event = LoginEvent::query()->sole();
        $this->assertSame(LoginEventType::Failed, $event->event);
        $this->assertNull($event->user_id);
        $this->assertSame('Ghost.User', $event->login_name);
        $this->assertNull($event->reason);
        $this->assertSame([self::OFFICE_IP, 'Linux', 'Firefox'], [$event->ip, $event->os, $event->browser]);
    }

    public function test_fifty_one_attempts_from_one_ip_are_throttled(): void
    {
        for ($i = 1; $i <= 50; $i++) {
            $this->failSignIn("nobody{$i}")->assertStatus(422);
        }

        $response = $this->failSignIn('nobody51')->assertStatus(429)->assertJsonPath('message', 'too_many_sign_ins');

        $this->assertGreaterThan(0, $response->json('retry_after'));
        $this->assertGreaterThan(0, (int) $response->headers->get('Retry-After'));
        $this->assertSame(50, LoginEvent::count());
        $this->failSignIn('nobody52', '198.51.100.20')->assertStatus(422);
    }

    public function test_ten_failures_from_many_ips_lock_the_username_for_fifteen_minutes(): void
    {
        $user = User::factory()->create();

        for ($i = 1; $i <= 10; $i++) {
            $this->failSignIn($user->email, "198.51.100.{$i}")->assertStatus(422);
        }

        $response = $this->browser(self::BROWSER_A, '198.51.100.11')
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');

        $this->assertEqualsWithDelta(900, $response->json('retry_after'), 5);
        $this->assertEqualsWithDelta(900, (int) $response->headers->get('Retry-After'), 5);
        $this->assertGuest();
        $this->assertSame(1, LoginEvent::query()->where('event', LoginEventType::Locked)->count());

        $this->travel(15)->minutes();

        $this->signIn($user)->assertOk();
    }

    public function test_the_username_lock_lasts_fifteen_minutes_from_the_tenth_failure(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 9) as $i) {
            $this->failSignIn($user->email, "198.51.100.{$i}")->assertStatus(422);
        }
        $this->travel(14)->minutes();
        $this->failSignIn($user->email, '198.51.100.10')->assertStatus(422);

        $this->travel(5)->minutes();
        $this->signIn($user)->assertStatus(429)->assertJsonPath('message', 'too_many_attempts');

        $this->travel(11)->minutes();
        $this->signIn($user, self::BROWSER_B)->assertOk();
    }

    /** Ten wrong passwords for $login, from 198.51.100.1 to .10. */
    private function lockFromOtherIps(string $login): void
    {
        foreach (range(1, 10) as $i) {
            $this->failSignIn($login, "198.51.100.{$i}")->assertStatus(422);
        }
    }

    private function signedInBefore(User $user, string $ip, int $daysAgo): void
    {
        LoginEvent::create([
            'user_id' => $user->id, 'event' => LoginEventType::SignedIn, 'ip' => $ip,
            'os' => 'Windows', 'browser' => 'Chrome', 'created_at' => now()->subDays($daysAgo),
        ]);
    }

    public function test_a_known_ip_still_signs_in_while_the_username_is_locked(): void
    {
        $user = User::factory()->create();
        $this->signedInBefore($user, self::OFFICE_IP, 3);
        $this->lockFromOtherIps($user->email);

        $this->signIn($user)->assertOk()->assertJsonPath('data.id', $user->id);
    }

    public function test_an_unknown_ip_is_still_locked(): void
    {
        $user = User::factory()->create();
        $this->signedInBefore($user, self::OFFICE_IP, 3);
        $this->lockFromOtherIps($user->email);

        $this->browser(self::BROWSER_A, '198.51.100.99')
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');
    }

    public function test_an_old_sign_in_does_not_make_an_ip_known(): void
    {
        $user = User::factory()->create();
        $this->signedInBefore($user, self::OFFICE_IP, 91);
        $this->lockFromOtherIps($user->email);

        $this->signIn($user)->assertStatus(429)->assertJsonPath('message', 'too_many_attempts');
    }

    public function test_email_and_username_share_one_counter(): void
    {
        $user = User::factory()->create(['username' => 'somchai.k']);

        foreach (range(1, 10) as $i) {
            $this->failSignIn($i <= 5 ? $user->email : 'somchai.k', "198.51.100.{$i}")->assertStatus(422);
        }

        foreach ([$user->email, 'somchai.k'] as $login) {
            $this->browser(self::BROWSER_A, '198.51.100.11')
                ->postJson('/api/login', ['login' => $login, 'password' => 'password'])
                ->assertStatus(429)
                ->assertJsonPath('message', 'too_many_attempts');
        }
    }

    public function test_an_unknown_name_is_locked_the_same_way(): void
    {
        foreach (range(1, 10) as $i) {
            $this->failSignIn($i % 2 === 0 ? 'Ghost.User' : 'ghost.user', "198.51.100.{$i}")->assertStatus(422);
        }

        $response = $this->failSignIn('ghost.user', '198.51.100.11')->assertStatus(429);

        $this->assertSame(['message', 'retry_after'], array_keys($response->json()));
        $this->assertSame('too_many_attempts', $response->json('message'));
        $this->assertEqualsWithDelta(900, $response->json('retry_after'), 5);
        $this->assertEqualsWithDelta(900, (int) $response->headers->get('Retry-After'), 5);
    }

    public function test_a_typed_name_shaped_like_an_account_key_never_locks_that_account(): void
    {
        $user = User::factory()->create();
        $this->lockFromOtherIps('id:'.$user->id);

        $this->browser(self::BROWSER_A, '198.51.100.200')
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        // The typed name keeps its own lock
        $this->failSignIn('id:'.$user->id, '198.51.100.201')->assertStatus(429)->assertJsonPath('message', 'too_many_attempts');
    }

    public function test_a_successful_sign_in_clears_the_username_counter(): void
    {
        AppSetting::put('device_limit', '0');
        $user = User::factory()->create();

        foreach (range(1, 9) as $i) {
            $this->failSignIn($user->email, "198.51.100.{$i}")->assertStatus(422);
        }
        $this->signIn($user)->assertOk();

        foreach (range(11, 19) as $i) {
            $this->failSignIn($user->email, "198.51.100.{$i}")->assertStatus(422);
        }
        $this->signIn($user, self::BROWSER_B)->assertOk();
    }

    public function test_a_resigned_account_gets_account_closed_without_a_session(): void
    {
        Event::fake([Login::class]);
        $employee = Employee::create(['first_name' => 'Gone', 'status' => EmployeeStatus::Resigned, 'last_day' => now()->subDay()->toDateString()]);
        $user = User::factory()->create(['employee_id' => $employee->id]);

        $this->signIn($user)->assertForbidden()->assertJsonPath('message', 'account_closed');

        $this->assertGuest();
        Event::assertNotDispatched(Login::class);
        $this->assertSame(self::BROWSER_A, session()->getId());
        $this->assertSame(0, UserDevice::count());
        $event = LoginEvent::query()->sole();
        $this->assertSame([LoginEventType::Failed, DeviceEndReason::AccountClosed, $user->id], [$event->event, $event->reason, $event->user_id]);
    }

    public function test_device_sign_out_allows_ten_tries_a_minute_per_pending_token(): void
    {
        [$first, $second] = [Str::random(40), Str::random(40)];
        for ($i = 0; $i < 10; $i++) {
            $this->signOutDevice(1, $first)->assertForbidden();
        }

        $this->signOutDevice(1, $first)->assertStatus(429)->assertJsonPath('message', 'too_many_sign_ins');

        // Another sign-in from the same office IP has its own ten
        for ($i = 0; $i < 10; $i++) {
            $this->signOutDevice(1, $second)->assertForbidden();
        }
        $this->signOutDevice(1, $second)->assertStatus(429);
    }

    public function test_device_sign_out_allows_fifty_tries_a_minute_per_ip(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $this->signOutDevice(1, Str::random(40))->assertForbidden();
        }

        $response = $this->signOutDevice(1, Str::random(40))->assertStatus(429)->assertJsonPath('message', 'too_many_sign_ins');

        $this->assertGreaterThan(0, $response->json('retry_after'));
        $this->browser(self::BROWSER_A, '198.51.100.20')->postJson('/api/login/devices/1/sign-out', ['pending' => Str::random(40)])->assertForbidden();
    }

    public function test_logout_ends_this_device(): void
    {
        $user = User::factory()->create();
        $this->signIn($user)->assertOk();
        $device = UserDevice::query()->sole();

        $this->browser(session()->getId())->postJson('/api/logout')->assertOk();

        $device->refresh();
        $this->assertNotNull($device->ended_at);
        $this->assertSame(DeviceEndReason::SignedOut, $device->end_reason);
        $this->assertTrue(LoginEvent::query()->where('event', LoginEventType::SignedOut)->where('device_id', $device->id)->exists());
    }

    public function test_signing_in_over_another_account_in_the_same_browser_ends_that_accounts_device(): void
    {
        $previous = User::factory()->create();
        $previousDevice = UserDevice::factory()->for($previous)->remembered()->create();
        $next = User::factory()->create();

        // A login tab left open in a browser that is still signed in as someone else
        $response = $this->browser(self::BROWSER_A)
            ->withSession([DeviceService::SESSION_KEY => $previousDevice->id])
            ->withCookie(Auth::guard('web')->getRecallerName(), 'the-previous-accounts-cookie')
            ->postJson('/api/login', ['login' => $next->email, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.id', $next->id);

        $previousDevice->refresh();
        $this->assertNotNull($previousDevice->ended_at);
        $this->assertSame(DeviceEndReason::SignedOut, $previousDevice->end_reason);
        $this->assertSame(1, $this->activeCount($next));
        $response->assertCookieExpired(Auth::guard('web')->getRecallerName());
    }

    public function test_signing_in_again_in_the_same_browser_keeps_one_device(): void
    {
        $user = User::factory()->create();
        $earlier = UserDevice::factory()->for($user)->create();

        $this->browser(self::BROWSER_A)
            ->withSession([DeviceService::SESSION_KEY => $earlier->id])
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk();

        $this->assertNotNull($earlier->fresh()->ended_at);
        $this->assertSame(1, $this->activeCount($user));
    }

    public function test_a_remembered_sign_in_tells_the_spa_when_remembering_ends(): void
    {
        $user = User::factory()->create();

        $response = $this->signIn($user, self::BROWSER_A, ['remember' => true])->assertOk();

        $device = UserDevice::query()->where('user_id', $user->id)->sole();
        $this->assertNotNull($device->remember_expires_at);
        $this->assertSame($device->remember_expires_at->toIso8601String(), $response->json('data.remember_expires_at'));
        $this->signIn(User::factory()->create(), self::BROWSER_B)->assertOk()->assertJsonPath('data.remember_expires_at', null);
    }
}
