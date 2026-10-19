<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\NetworkName;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// A device counts as active until it ends or outlives its lifetime; idle timeout and remember-me change that lifetime.
class UserDeviceActiveTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['session.lifetime' => 120]);
    }

    /** @return list<int> */
    private function activeIds(): array
    {
        return UserDevice::active()->orderBy('id')->pluck('id')->all();
    }

    public function test_a_device_without_remember_expires_after_the_session_lifetime(): void
    {
        $fresh = UserDevice::factory()->create(['last_active_at' => now()->subMinutes(119)]);
        UserDevice::factory()->create(['last_active_at' => now()->subMinutes(121)]);

        $this->assertSame([$fresh->id], $this->activeIds());
    }

    public function test_the_idle_timeout_shortens_the_lifetime_when_it_is_on(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $fresh = UserDevice::factory()->create(['last_active_at' => now()->subMinutes(29)]);
        UserDevice::factory()->create(['last_active_at' => now()->subMinutes(31)]);

        $this->assertSame([$fresh->id], $this->activeIds());
    }

    public function test_an_idle_timeout_longer_than_the_session_lifetime_does_not_stretch_it(): void
    {
        AppSetting::put('session_timeout_minutes', '480');

        $this->assertSame(120, UserDevice::lifetimeMinutes());
    }

    public function test_the_lifetime_is_the_session_lifetime_when_the_idle_timeout_is_off(): void
    {
        $this->assertSame(120, UserDevice::lifetimeMinutes());

        AppSetting::put('session_timeout_minutes', '0');

        $this->assertSame(120, UserDevice::lifetimeMinutes());
    }

    public function test_a_remembered_device_lives_until_its_remember_expiry(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $remembered = UserDevice::factory()->create([
            'remember_expires_at' => now()->addDay(),
            'last_active_at' => now()->subDays(3),
        ]);
        UserDevice::factory()->create([
            'remember_expires_at' => now()->subMinute(),
            'last_active_at' => now()->subDays(3),
        ]);

        $this->assertSame([$remembered->id], $this->activeIds());
    }

    public function test_an_ended_device_is_never_active(): void
    {
        UserDevice::factory()->create(['ended_at' => now(), 'end_reason' => DeviceEndReason::SignedOut]);
        UserDevice::factory()->create([
            'ended_at' => now(),
            'end_reason' => DeviceEndReason::Profile,
            'remember_expires_at' => now()->addDay(),
        ]);

        $this->assertSame([], $this->activeIds());
    }

    public function test_the_factory_states_build_a_remembered_and_an_ended_device(): void
    {
        $remembered = UserDevice::factory()->remembered()->create(['last_active_at' => now()->subDays(2)]);
        $ended = UserDevice::factory()->ended(DeviceEndReason::Limit)->create();

        $this->assertSame(64, strlen($remembered->remember_token_hash));
        $this->assertSame([$remembered->id], $this->activeIds());
        $this->assertSame(DeviceEndReason::Limit, $ended->fresh()->end_reason);
    }

    public function test_the_active_scope_can_be_judged_at_another_moment(): void
    {
        $device = UserDevice::factory()->create(['last_active_at' => now()]);

        $this->assertSame([$device->id], UserDevice::active(now()->addMinutes(119))->pluck('id')->all());
        $this->assertSame([], UserDevice::active(now()->addMinutes(121))->pluck('id')->all());
    }

    public function test_every_device_is_either_active_or_inactive_never_both(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        UserDevice::factory()->create(['last_active_at' => now()->subMinutes(29)]);
        UserDevice::factory()->create(['last_active_at' => now()->subMinutes(31)]);
        UserDevice::factory()->create(['remember_expires_at' => now()->addDay(), 'last_active_at' => now()->subDays(3)]);
        UserDevice::factory()->create(['remember_expires_at' => now()->subMinute(), 'last_active_at' => now()->subDays(3)]);
        UserDevice::factory()->ended()->create(['remember_expires_at' => now()->addDay()]);
        UserDevice::factory()->ended()->create();
        $all = UserDevice::query()->orderBy('id')->pluck('id')->all();

        foreach ([now(), now()->addMinutes(20), now()->addDays(2)] as $moment) {
            $active = UserDevice::active($moment)->pluck('id')->all();
            $inactive = UserDevice::inactive($moment)->pluck('id')->all();

            $this->assertSame([], array_intersect($active, $inactive));
            $this->assertEqualsCanonicalizing($all, [...$active, ...$inactive]);
        }
        $this->assertCount(2, UserDevice::active()->get());
    }

    public function test_a_user_lists_their_devices(): void
    {
        $user = User::factory()->create();
        $mine = UserDevice::factory()->create(['user_id' => $user->id]);
        UserDevice::factory()->create();

        $this->assertSame([$mine->id], $user->devices()->pluck('id')->all());
    }

    public function test_device_columns_are_cast_to_their_types(): void
    {
        $device = UserDevice::factory()->create([
            'ended_at' => now(),
            'end_reason' => DeviceEndReason::ThirdDevice,
            'ended_by' => ['device_id' => 7, 'ip' => '10.0.0.5'],
        ])->fresh();

        $this->assertSame(DeviceEndReason::ThirdDevice, $device->end_reason);
        $this->assertSame(['device_id' => 7, 'ip' => '10.0.0.5'], $device->ended_by);
        $this->assertInstanceOf(CarbonInterface::class, $device->signed_in_at);
        $this->assertInstanceOf(CarbonInterface::class, $device->last_active_at);
    }

    public function test_a_login_event_keeps_no_updated_at_and_casts_its_enums(): void
    {
        $user = User::factory()->create();
        $device = UserDevice::factory()->create(['user_id' => $user->id]);

        $event = LoginEvent::create([
            'user_id' => $user->id,
            'login_name' => 'somchai',
            'event' => LoginEventType::ForcedOut,
            'reason' => DeviceEndReason::IdleTimeout,
            'device_id' => $device->id,
            'ip' => '10.0.0.5',
            'created_at' => now(),
        ])->fresh();

        $this->assertSame(LoginEventType::ForcedOut, $event->event);
        $this->assertSame(DeviceEndReason::IdleTimeout, $event->reason);
        $this->assertFalse($event->remembered);
        $this->assertArrayNotHasKey('updated_at', $event->getAttributes());
    }

    public function test_deleting_a_user_removes_their_devices_but_keeps_their_login_events(): void
    {
        $user = User::factory()->create();
        UserDevice::factory()->create(['user_id' => $user->id]);
        LoginEvent::create(['user_id' => $user->id, 'event' => LoginEventType::SignedIn, 'created_at' => now()]);

        $user->delete();

        $this->assertDatabaseCount('user_devices', 0);
        $this->assertDatabaseHas('login_events', ['event' => 'signed_in', 'user_id' => null]);
    }

    public function test_a_network_name_cidr_is_unique(): void
    {
        NetworkName::create(['cidr' => '10.1.0.0/16', 'name' => 'Head office']);

        $this->expectException(QueryException::class);

        NetworkName::create(['cidr' => '10.1.0.0/16', 'name' => 'Duplicate']);
    }
}
