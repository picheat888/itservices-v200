<?php

// The profile Devices tab API: the caller's own active devices, signing another one out, and the last 10 login events.

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyDevicesApiTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    /** A signed-in SPA session of $device's owner, on that device. */
    private function onDevice(UserDevice $device): static
    {
        return $this->actingAs($device->user)
            ->withHeader('Origin', self::ORIGIN)
            ->withSession([DeviceService::SESSION_KEY => $device->id]);
    }

    private function eventFor(User $user, LoginEventType $event, string $at, array $extra = []): LoginEvent
    {
        return LoginEvent::create([
            'user_id' => $user->id,
            'event' => $event,
            'ip' => '203.150.12.85',
            'os' => 'Windows',
            'browser' => 'Chrome',
            'created_at' => $at,
            ...$extra,
        ]);
    }

    public function test_the_list_holds_only_the_callers_active_devices_and_marks_this_one(): void
    {
        AppSetting::put('device_limit', '2');
        $user = User::factory()->create();
        $current = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subMinutes(5), 'os' => 'Windows', 'browser' => 'Chrome']);
        $other = UserDevice::factory()->for($user)->remembered()->create(['last_active_at' => now()->subMinute(), 'os' => 'iPadOS', 'browser' => 'Safari']);
        UserDevice::factory()->for($user)->ended(DeviceEndReason::Profile)->create();
        UserDevice::factory()->for($user)->create(['last_active_at' => now()->subDay()]);
        UserDevice::factory()->for(User::factory()->create())->create();

        $response = $this->onDevice($current)->getJson('/api/me/devices')->assertOk();

        $response->assertJsonPath('meta.limit', 2)->assertJsonCount(2, 'data');
        $this->assertSame([$other->id, $current->id], array_column($response->json('data'), 'id'));
        $this->assertSame([false, true], array_column($response->json('data'), 'current'));
        $response->assertJsonPath('data.0.remembered', true)
            ->assertJsonPath('data.0.os', 'iPadOS')
            ->assertJsonStructure(['data' => [['id', 'os', 'browser', 'ip', 'location', 'signed_in_at', 'last_active_at', 'remembered', 'remember_expires_at', 'current']]]);
        $this->assertArrayNotHasKey('session_id', $response->json('data.0'));
        $this->assertArrayNotHasKey('remember_token_hash', $response->json('data.0'));
    }

    public function test_the_limit_reads_zero_when_the_device_limit_is_off(): void
    {
        $device = UserDevice::factory()->create();

        $this->onDevice($device)->getJson('/api/me/devices')->assertOk()->assertJsonPath('meta.limit', 0);
    }

    public function test_another_device_can_be_signed_out_from_the_profile(): void
    {
        $user = User::factory()->create();
        $current = UserDevice::factory()->for($user)->create();
        $other = UserDevice::factory()->for($user)->create(['os' => 'Android', 'browser' => 'Firefox']);

        $this->onDevice($current)->deleteJson("/api/me/devices/{$other->id}")
            ->assertOk()
            ->assertJsonPath('message', 'success');

        $other->refresh();
        $this->assertNotNull($other->ended_at);
        $this->assertSame(DeviceEndReason::Profile, $other->end_reason);
        $this->assertNull($other->session_id);
        $this->assertNull($current->fresh()->ended_at);

        $event = LoginEvent::where('device_id', $other->id)->firstOrFail();
        $this->assertSame(LoginEventType::ForcedOut, $event->event);
        $this->assertSame(DeviceEndReason::Profile, $event->reason);
        $this->assertSame($user->id, $event->user_id);
        $this->assertSame('Android', $event->os);

        $this->getJson('/api/me/devices')->assertJsonCount(1, 'data');
    }

    public function test_the_device_in_use_cannot_be_signed_out_from_here(): void
    {
        $user = User::factory()->create();
        $current = UserDevice::factory()->for($user)->create();
        UserDevice::factory()->for($user)->create();

        $this->onDevice($current)->deleteJson("/api/me/devices/{$current->id}")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'current_device');

        $this->assertNull($current->fresh()->ended_at);
        $this->assertSame(0, LoginEvent::count());
    }

    public function test_someone_elses_device_is_not_found_and_stays_signed_in(): void
    {
        $mine = UserDevice::factory()->create();
        $theirs = UserDevice::factory()->for(User::factory()->create())->create();

        $this->onDevice($mine)->deleteJson("/api/me/devices/{$theirs->id}")->assertNotFound();

        $this->assertNull($theirs->fresh()->ended_at);
        $this->assertSame(0, LoginEvent::count());
    }

    public function test_a_device_already_ended_is_not_found(): void
    {
        $user = User::factory()->create();
        $current = UserDevice::factory()->for($user)->create();
        $gone = UserDevice::factory()->for($user)->ended(DeviceEndReason::Limit)->create();

        $this->onDevice($current)->deleteJson("/api/me/devices/{$gone->id}")->assertNotFound();
        $this->deleteJson('/api/me/devices/999999')->assertNotFound();
    }

    public function test_guests_are_refused(): void
    {
        $this->getJson('/api/me/devices')->assertUnauthorized();
        $this->deleteJson('/api/me/devices/1')->assertUnauthorized();
        $this->getJson('/api/me/login-events')->assertUnauthorized();
    }

    public function test_the_last_ten_events_of_the_caller_come_newest_first(): void
    {
        $user = User::factory()->create();
        $stranger = User::factory()->create();
        foreach (range(1, 12) as $minute) {
            $this->eventFor($user, LoginEventType::SignedIn, now()->subHours(24)->addMinutes($minute)->toDateTimeString());
        }
        $this->eventFor($stranger, LoginEventType::SignedIn, now()->toDateTimeString());
        $failed = $this->eventFor($user, LoginEventType::Failed, now()->subHours(2)->toDateTimeString(), ['login_name' => 'somchai']);

        $device = UserDevice::factory()->for($user)->create();
        $response = $this->onDevice($device)->getJson('/api/me/login-events')->assertOk();

        $rows = $response->json('data');
        $this->assertCount(10, $rows);
        $this->assertSame($failed->id, $rows[0]['id']);
        $this->assertSame(['failed', 'signed_in'], [$rows[0]['event'], $rows[1]['event']]);
        $this->assertSame([$user->id], array_values(array_unique(array_column(array_column($rows, 'user'), 'id'))));
        $times = array_column($rows, 'created_at');
        $sorted = $times;
        rsort($sorted);
        $this->assertSame($sorted, $times);
    }
}
