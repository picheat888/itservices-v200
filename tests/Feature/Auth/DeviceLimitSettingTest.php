<?php

// Security settings: the device limit trims accounts over it, and the Login log window and GeoIP date show in the payload.

namespace Tests\Feature\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Models\Auth\UserDevice;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\DeviceService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class DeviceLimitSettingTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private string $storage = '';

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = sys_get_temp_dir().DIRECTORY_SEPARATOR.'itsd-limit-'.bin2hex(random_bytes(4));
        File::ensureDirectoryExists($this->storage);
        $this->app->useStoragePath($this->storage);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storage);

        parent::tearDown();
    }

    /**
     * Active devices of $user, the first one the most recently used.
     *
     * @return Collection<int, UserDevice>
     */
    private function devicesOf(User $user, int $count): Collection
    {
        return collect(range(1, $count))->map(fn (int $position) => UserDevice::factory()->for($user)->create([
            'last_active_at' => now()->subMinutes($position * 5),
        ]));
    }

    private function activeCount(User $user): int
    {
        return UserDevice::active()->where('user_id', $user->id)->count();
    }

    /** A signed-in SPA session of $admin, on $device when given. */
    private function browserOf(User $admin, ?UserDevice $device = null): static
    {
        $browser = $this->actingAs($admin)->withHeader('Origin', self::ORIGIN);

        return $device === null ? $browser : $browser->withSession([DeviceService::SESSION_KEY => $device->id]);
    }

    /** @param  array<string, mixed>  $settings */
    private function save(array $settings): TestResponse
    {
        return $this->putJson('/api/settings/security', ['session_timeout_minutes' => 0, 'password_expiry_days' => 0, ...$settings]);
    }

    public function test_turning_the_limit_on_keeps_only_the_latest_device_of_accounts_over_it(): void
    {
        $admin = User::factory()->create(['role' => 'super']);
        $current = UserDevice::factory()->for($admin)->create(['last_active_at' => now()->subSeconds(30)]);
        $adminLatest = UserDevice::factory()->for($admin)->create(['last_active_at' => now()]);
        $adminOldest = UserDevice::factory()->for($admin)->create(['last_active_at' => now()->subHour()]);
        $userA = User::factory()->create();
        [$latestOfA, $middleOfA, $oldestOfA] = $this->devicesOf($userA, 3);
        $userB = User::factory()->create();
        $this->devicesOf($userB, 2);

        $this->browserOf($admin, $current)->save(['device_limit' => 2])
            ->assertOk()
            ->assertJsonPath('data.device_limit', 2);

        $this->assertSame('2', AppSetting::get('device_limit'));
        $this->assertSame(1, $this->activeCount($userA));
        $this->assertNull($latestOfA->fresh()->ended_at);
        $this->assertSame(DeviceEndReason::Limit, $middleOfA->fresh()->end_reason);
        $this->assertSame(DeviceEndReason::Limit, $oldestOfA->fresh()->end_reason);
        $this->assertSame(2, $this->activeCount($userB), 'an account at the limit is untouched');
        // The admin who saves never signs themselves out, even when another device was used more recently
        $this->assertSame(1, $this->activeCount($admin));
        $this->assertNull($current->fresh()->ended_at);
        $this->assertNotNull($adminLatest->fresh()->ended_at);
        $this->assertNotNull($adminOldest->fresh()->ended_at);
    }

    public function test_lowering_the_limit_trims_again(): void
    {
        AppSetting::put('device_limit', '3');
        $admin = User::factory()->create(['role' => 'super']);
        $userA = User::factory()->create();
        $this->devicesOf($userA, 3);
        $userB = User::factory()->create();
        $this->devicesOf($userB, 2);
        $browser = $this->browserOf($admin);

        $browser->save(['device_limit' => 2])->assertOk();

        $this->assertSame(1, $this->activeCount($userA));
        $this->assertSame(2, $this->activeCount($userB));

        $browser->save(['device_limit' => 1])->assertOk();

        $this->assertSame(1, $this->activeCount($userA));
        $this->assertSame(1, $this->activeCount($userB));
        $this->assertSame('1', AppSetting::get('device_limit'));
    }

    public function test_raising_or_saving_the_same_limit_ends_nothing(): void
    {
        AppSetting::put('device_limit', '2');
        $admin = User::factory()->create(['role' => 'super']);
        $user = User::factory()->create();
        $this->devicesOf($user, 4);
        $browser = $this->browserOf($admin);

        $browser->save(['device_limit' => 3])->assertOk();
        $this->assertSame(4, $this->activeCount($user), 'raising the limit ends nothing');

        $browser->save(['device_limit' => 3])->assertOk();
        $this->assertSame(4, $this->activeCount($user), 'saving the same limit ends nothing');

        $browser->save(['device_limit' => 0])->assertOk();
        $this->assertSame(4, $this->activeCount($user), 'turning the limit off ends nothing');
        $this->assertSame(0, UserDevice::whereNotNull('ended_at')->count());
    }

    public function test_saving_without_the_device_limit_leaves_it_alone(): void
    {
        AppSetting::put('device_limit', '2');
        $user = User::factory()->create();
        $this->devicesOf($user, 3);

        $this->browserOf(User::factory()->create(['role' => 'super']))->save(['login_log_days' => 90])->assertOk();

        $this->assertSame('2', AppSetting::get('device_limit'));
        $this->assertSame(3, $this->activeCount($user));
        $this->assertSame('90', AppSetting::get('login_log_days'));
    }

    public function test_the_security_payload_carries_the_new_keys(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/settings/security')
            ->assertOk()
            ->assertJsonPath('data.device_limit', 0)
            ->assertJsonPath('data.login_log_days', 365)
            ->assertJsonPath('data.geoip_updated_at', null);

        $file = storage_path('app/geoip/dbip-city-lite.mmdb');
        File::ensureDirectoryExists(dirname($file));
        File::put($file, 'database bytes');
        $modified = strtotime('2026-10-03 03:30:00 UTC');
        touch($file, $modified);
        clearstatcache();

        $this->putJson('/api/settings/security', [
            'session_timeout_minutes' => 0,
            'password_expiry_days' => 0,
            'device_limit' => 3,
            'login_log_days' => 0,
        ])->assertOk();

        $response = $this->getJson('/api/settings/security')
            ->assertOk()
            ->assertJsonPath('data.device_limit', 3)
            ->assertJsonPath('data.login_log_days', 0);

        $updatedAt = $response->json('data.geoip_updated_at');
        $this->assertIsString($updatedAt);
        $this->assertSame($modified, Carbon::parse($updatedAt)->getTimestamp());
        $this->assertSame(Carbon::createFromTimestamp($modified, config('app.timezone'))->toIso8601String(), $updatedAt);
    }

    public function test_the_geoip_date_is_read_only(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->save(['geoip_updated_at' => '2020-01-01T00:00:00+00:00'])
            ->assertOk()
            ->assertJsonPath('data.geoip_updated_at', null);

        $this->assertNull(AppSetting::get('geoip_updated_at'));
    }

    public function test_the_new_settings_are_validated(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->save(['device_limit' => 11])->assertUnprocessable()->assertJsonValidationErrors('device_limit');
        $this->save(['device_limit' => -1])->assertUnprocessable()->assertJsonValidationErrors('device_limit');
        $this->save(['device_limit' => 'many'])->assertUnprocessable()->assertJsonValidationErrors('device_limit');
        $this->save(['login_log_days' => 3651])->assertUnprocessable()->assertJsonValidationErrors('login_log_days');
        $this->save(['login_log_days' => -1])->assertUnprocessable()->assertJsonValidationErrors('login_log_days');

        $this->save(['device_limit' => 10, 'login_log_days' => 3650])->assertOk();
    }

    public function test_the_login_history_window_is_zero_or_at_least_ninety_days(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->save(['login_log_days' => 0])->assertOk()->assertJsonPath('data.login_log_days', 0);
        $this->save(['login_log_days' => 90])->assertOk()->assertJsonPath('data.login_log_days', 90);

        $this->save(['login_log_days' => 45])->assertUnprocessable()->assertJsonValidationErrors('login_log_days');
        $this->save(['login_log_days' => 89])->assertUnprocessable()->assertJsonValidationErrors('login_log_days');
        $this->assertSame('90', AppSetting::get('login_log_days'), 'a refused value is not stored');
    }

    public function test_a_refused_login_history_window_says_how_low_it_can_go(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->withHeader('X-Locale', 'en')->save(['login_log_days' => 45])
            ->assertJsonPath('errors.login_log_days.0', 'Keep the login history for at least 90 days, or keep it forever (0).');
        $this->withHeader('X-Locale', 'th')->save(['login_log_days' => 45])
            ->assertJsonPath('errors.login_log_days.0', 'เก็บประวัติการเข้าสู่ระบบอย่างน้อย 90 วัน หรือเก็บตลอดไป');
    }
}
