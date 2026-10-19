<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\NetworkName;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// DeviceService: starting, ending, trimming device rows and the login events they leave behind.
class DeviceServiceTest extends TestCase
{
    use RefreshDatabase;

    private const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

    protected function setUp(): void
    {
        parent::setUp();

        config(['session.lifetime' => 120]);
    }

    private function service(): DeviceService
    {
        return $this->app->make(DeviceService::class);
    }

    /** @param  array<string, mixed>  $input */
    private function requestFrom(string $ip, string $userAgent, array $input = []): Request
    {
        $request = Request::create('/api/login', 'POST', $input, [], [], ['REMOTE_ADDR' => $ip, 'HTTP_USER_AGENT' => $userAgent]);
        $request->setLaravelSession($this->app['session.store']);

        return $request;
    }

    public function test_start_creates_an_active_device_and_a_signed_in_event(): void
    {
        NetworkName::create(['cidr' => '203.0.113.0/24', 'name' => 'Head office']);
        $user = User::factory()->create();
        $request = $this->requestFrom('203.0.113.5', self::IPAD_SAFARI, ['touch' => true]);

        $device = $this->service()->start($user, $request, 'device-token');

        $this->assertTrue(UserDevice::active()->whereKey($device->id)->exists());
        $this->assertSame($user->id, $device->user_id);
        $this->assertSame($request->session()->getId(), $device->session_id);
        $this->assertSame($device->id, $request->session()->get(DeviceService::SESSION_KEY));
        $this->assertSame(hash('sha256', 'device-token'), $device->fresh()->remember_token_hash);
        $this->assertEqualsWithDelta(now()->addMinutes((int) config('auth.guards.web.remember'))->timestamp, $device->remember_expires_at->timestamp, 5);
        $this->assertSame(['203.0.113.5', 'Head office', 'iPadOS', 'Safari'], [$device->ip, $device->location, $device->os, $device->browser]);
        $this->assertSame(self::IPAD_SAFARI, $device->user_agent);

        $event = LoginEvent::sole();
        $this->assertSame(LoginEventType::SignedIn, $event->event);
        $this->assertSame([$user->id, $device->id, true], [$event->user_id, $event->device_id, $event->remembered]);
        $this->assertNull($event->reason);
        $this->assertSame(['203.0.113.5', 'Head office', 'iPadOS', 'Safari'], [$event->ip, $event->location, $event->os, $event->browser]);
    }

    public function test_start_without_remember_or_event(): void
    {
        $user = User::factory()->create();

        $device = $this->service()->start($user, $this->requestFrom('198.51.100.9', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0'), null, recordEvent: false);

        $this->assertNull($device->fresh()->remember_token_hash);
        $this->assertNull($device->remember_expires_at);
        $this->assertTrue(UserDevice::active()->whereKey($device->id)->exists());
        $this->assertSame(0, LoginEvent::count());
    }

    public function test_start_keeps_its_token_out_of_the_users_table(): void
    {
        $user = User::factory()->create(['password_changed_at' => null]);
        $usersToken = $user->remember_token;
        $user->setRememberToken('token-set-by-hand');

        $this->service()->start($user, $this->requestFrom('198.51.100.9', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0'), 'token-set-by-hand');
        $user->forceFill(['password_changed_at' => now()])->saveQuietly();

        $this->assertSame('token-set-by-hand', $user->getRememberToken());
        $this->assertSame($usersToken, $user->fresh()->remember_token);
    }

    public function test_reattach_moves_the_device_to_the_new_session_and_records_a_remembered_sign_in(): void
    {
        $device = UserDevice::factory()->remembered()->create([
            'session_id' => 'old-session', 'ip' => '198.51.100.1', 'last_active_at' => now()->subDay(),
        ]);
        $request = $this->requestFrom('198.51.100.2', 'Mozilla/5.0 (Windows NT 10.0) Firefox/131.0');

        $this->service()->reattach($device, $request);

        $device->refresh();
        $this->assertSame($request->session()->getId(), $device->session_id);
        $this->assertSame($device->id, $request->session()->get(DeviceService::SESSION_KEY));
        $this->assertSame(['198.51.100.2', 'Windows', 'Firefox'], [$device->ip, $device->os, $device->browser]);
        $this->assertEqualsWithDelta(now()->timestamp, $device->last_active_at->timestamp, 5);

        $event = LoginEvent::sole();
        $this->assertSame(LoginEventType::SignedIn, $event->event);
        $this->assertTrue($event->remembered);
        $this->assertSame($device->id, $event->device_id);
    }

    public function test_end_deletes_the_session_row_and_records_forced_out_with_the_reason(): void
    {
        $device = UserDevice::factory()->remembered()->create([
            'session_id' => 'session-of-the-ended-device', 'ip' => '198.51.100.7', 'location' => 'Rayong, Thailand',
            'os' => 'macOS', 'browser' => 'Safari',
        ]);
        $other = UserDevice::factory()->create(['user_id' => $device->user_id, 'session_id' => 'session-that-stays']);
        foreach (['session-of-the-ended-device', 'session-that-stays'] as $sessionId) {
            DB::table('sessions')->insert(['id' => $sessionId, 'user_id' => $device->user_id, 'payload' => '', 'last_activity' => time()]);
        }
        Cache::put(DeviceService::stateCacheKey('session-of-the-ended-device'), 'active', 30);
        $endedBy = ['os' => 'Windows', 'browser' => 'Edge', 'location' => 'Bangkok, Thailand', 'at' => now()->toIso8601String()];

        $this->service()->end($device, DeviceEndReason::ThirdDevice, $endedBy);

        $device->refresh();
        $this->assertNotNull($device->ended_at);
        $this->assertSame(DeviceEndReason::ThirdDevice, $device->end_reason);
        $this->assertSame($endedBy, $device->ended_by);
        $this->assertNull($device->session_id);
        $this->assertNull($device->remember_token_hash);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-of-the-ended-device']);
        $this->assertDatabaseHas('sessions', ['id' => 'session-that-stays']);
        $this->assertFalse(Cache::has(DeviceService::stateCacheKey('session-of-the-ended-device')));
        $this->assertNull($other->fresh()->ended_at);

        $event = LoginEvent::sole();
        $this->assertSame(LoginEventType::ForcedOut, $event->event);
        $this->assertSame(DeviceEndReason::ThirdDevice, $event->reason);
        $this->assertSame([$device->user_id, $device->id], [$event->user_id, $event->device_id]);
        // The event describes the ended device, not the request that ended it
        $this->assertSame(['198.51.100.7', 'Rayong, Thailand', 'macOS', 'Safari'], [$event->ip, $event->location, $event->os, $event->browser]);
    }

    public function test_signing_out_records_a_signed_out_event(): void
    {
        $device = UserDevice::factory()->create();

        $this->service()->end($device, DeviceEndReason::SignedOut);

        $this->assertSame(DeviceEndReason::SignedOut, $device->fresh()->end_reason);
        $event = LoginEvent::sole();
        $this->assertSame(LoginEventType::SignedOut, $event->event);
        $this->assertNull($event->reason);
    }

    public function test_end_is_idempotent(): void
    {
        $device = UserDevice::factory()->create();

        $this->service()->end($device, DeviceEndReason::Profile);
        $endedAt = $device->fresh()->ended_at;
        $this->travel(5)->minutes();
        $this->service()->end($device, DeviceEndReason::Limit);
        $this->service()->end(UserDevice::find($device->id), DeviceEndReason::Limit);

        $device->refresh();
        $this->assertSame(DeviceEndReason::Profile, $device->end_reason);
        $this->assertTrue($endedAt->equalTo($device->ended_at));
        $this->assertSame(1, LoginEvent::count());
    }

    public function test_active_lists_the_most_recently_used_first(): void
    {
        $user = User::factory()->create();
        $older = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinutes(20)]);
        $newer = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinute()]);
        UserDevice::factory()->for($user)->ended()->create();
        UserDevice::factory()->for($user)->create(['last_active_at' => now()->subHours(3)]);
        UserDevice::factory()->create();

        $this->assertSame([$newer->id, $older->id], $this->service()->active($user)->pluck('id')->all());
    }

    public function test_trim_keeps_only_the_most_recent_device_for_accounts_over_the_limit(): void
    {
        $userA = User::factory()->create();
        $latest = UserDevice::factory()->for($userA)->create(['last_active_at' => now()->subMinute()]);
        $middle = UserDevice::factory()->for($userA)->create(['last_active_at' => now()->subMinutes(5)]);
        $oldest = UserDevice::factory()->for($userA)->remembered()->create(['last_active_at' => now()->subMinutes(30)]);
        $userB = User::factory()->create();
        $devicesOfB = UserDevice::factory()->count(2)->for($userB)->create();

        $ended = $this->service()->trimTo(2);

        $this->assertSame(2, $ended);
        $this->assertNull($latest->fresh()->ended_at);
        $this->assertSame(DeviceEndReason::Limit, $middle->fresh()->end_reason);
        $this->assertSame(DeviceEndReason::Limit, $oldest->fresh()->end_reason);
        $this->assertSame(2, UserDevice::active()->where('user_id', $userB->id)->count());
        $this->assertTrue($devicesOfB->every(fn (UserDevice $device) => $device->fresh()->ended_at === null));
        $this->assertSame(2, LoginEvent::where('event', LoginEventType::ForcedOut)->where('reason', DeviceEndReason::Limit)->count());
    }

    public function test_trim_keeps_the_given_device_of_its_account(): void
    {
        $user = User::factory()->create();
        $latest = UserDevice::factory()->for($user)->create(['last_active_at' => now()]);
        $saving = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinutes(2)]);
        $userB = User::factory()->create();
        $latestOfB = UserDevice::factory()->for($userB)->create(['last_active_at' => now()]);
        $olderOfB = UserDevice::factory()->for($userB)->create(['last_active_at' => now()->subMinutes(3)]);

        $this->assertSame(2, $this->service()->trimTo(1, $saving->id));

        $this->assertNull($saving->fresh()->ended_at);
        $this->assertNotNull($latest->fresh()->ended_at);
        // The kept id belongs to another account, so B keeps its most recent device
        $this->assertNull($latestOfB->fresh()->ended_at);
        $this->assertNotNull($olderOfB->fresh()->ended_at);
    }

    public function test_trimming_many_devices_asks_for_the_sessions_table_once(): void
    {
        $user = User::factory()->create();
        UserDevice::factory()->count(4)->for($user)->sequence(fn ($sequence) => ['last_active_at' => now()->subMinutes($sequence->index)])->create();
        $tableChecks = 0;
        DB::listen(function ($query) use (&$tableChecks) {
            if (str_contains($query->sql, 'sqlite_master')) {
                $tableChecks++;
            }
        });

        $this->assertSame(3, $this->service()->trimTo(1));

        $this->assertSame(1, $tableChecks);
    }

    public function test_trim_with_the_limit_off_ends_nothing(): void
    {
        UserDevice::factory()->count(3)->for(User::factory())->create();

        $this->assertSame(0, $this->service()->trimTo(0));
        $this->assertSame(3, UserDevice::active()->count());
    }

    public function test_password_change_ends_every_device(): void
    {
        $user = User::factory()->create();
        $thisBrowser = UserDevice::factory()->for($user)->create(['session_id' => 'this-browser']);
        $others = collect([
            UserDevice::factory()->for($user)->remembered()->create(),
            UserDevice::factory()->for($user)->create(),
        ]);
        $stranger = UserDevice::factory()->create();

        $user->signOutEverywhere('this-browser');

        $this->assertNull($thisBrowser->fresh()->ended_at);
        $others->each(fn (UserDevice $device) => $this->assertSame(DeviceEndReason::PasswordChanged, $device->fresh()->end_reason));
        $this->assertNull($others->first()->fresh()->remember_token_hash);
        $this->assertNull($stranger->fresh()->ended_at);

        $user->signOutEverywhere();

        $this->assertSame(DeviceEndReason::PasswordChanged, $thisBrowser->fresh()->end_reason);
        $this->assertSame(0, UserDevice::active()->where('user_id', $user->id)->count());
        $this->assertSame(3, LoginEvent::where('reason', DeviceEndReason::PasswordChanged)->count());
    }

    public function test_limit_reads_the_device_limit_setting(): void
    {
        $this->assertSame(0, $this->service()->limit());

        AppSetting::put('device_limit', '2');

        $this->assertSame(2, $this->service()->limit());
    }
}
