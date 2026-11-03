<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class MonitorPairingTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function userWith(string $role, string ...$permissions): User
    {
        $user = User::factory()->create(['role' => $role]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    private function admin(): User
    {
        return $this->userWith('monitor_admin', 'settings.access', 'settings.monitor');
    }

    /** @return array{pairing_id: string, code: string, expires_at: string} */
    private function tvAsksForCode(): array
    {
        return $this->withHeader('User-Agent', self::CHROME_ON_WINDOWS)
            ->postJson('/api/monitor/pairings')
            ->assertOk()
            ->json('data');
    }

    private function tvPolls(string $pairingId): array
    {
        return $this->getJson("/api/monitor/pairings/{$pairingId}")->assertOk()->json('data');
    }

    /** Pairs a TV end to end and returns its device token. */
    private function pairTv(User $admin): string
    {
        $pairing = $this->tvAsksForCode();
        $this->actingAs($admin)->postJson('/api/settings/monitor/pair', ['code' => $pairing['code']])->assertOk();

        return $this->tvPolls($pairing['pairing_id'])['device_token'];
    }

    public function test_tv_gets_a_six_digit_code(): void
    {
        $pairing = $this->tvAsksForCode();

        $this->assertMatchesRegularExpression('/^\d{6}$/', $pairing['code']);
        $this->assertSame(40, strlen($pairing['pairing_id']));
        $this->assertNotEmpty($pairing['expires_at']);
        $this->assertSame(['status' => 'pending'], $this->tvPolls($pairing['pairing_id']));
    }

    public function test_admin_pairs_with_the_code_and_tv_receives_token_once(): void
    {
        $admin = $this->admin();
        $pairing = $this->tvAsksForCode();

        $this->actingAs($admin)->postJson('/api/settings/monitor/pair', ['code' => $pairing['code']])
            ->assertOk()
            ->assertJsonPath('data.paired', true)
            ->assertJsonPath('data.browser', 'Chrome')
            ->assertJsonPath('data.os', 'Windows')
            ->assertJsonPath('data.paired_by', $admin->name);

        $first = $this->tvPolls($pairing['pairing_id']);
        $this->assertSame('paired', $first['status']);
        $this->assertSame(64, strlen($first['device_token']));

        $this->assertSame(['status' => 'expired'], $this->tvPolls($pairing['pairing_id']));
    }

    public function test_token_is_stored_hashed(): void
    {
        $token = $this->pairTv($this->admin());

        $stored = (string) AppSetting::get('monitor_device');
        $this->assertStringNotContainsString($token, $stored);
        $this->assertStringContainsString(hash('sha256', $token), $stored);
    }

    public function test_wrong_code_is_refused(): void
    {
        $this->tvAsksForCode();

        $this->actingAs($this->admin())->postJson('/api/settings/monitor/pair', ['code' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'monitor_code_invalid')
            ->assertJsonPath('errors.code.0', 'monitor_code_invalid');
    }

    public function test_code_must_be_six_digits(): void
    {
        $this->actingAs($this->admin())->postJson('/api/settings/monitor/pair', ['code' => '12ab'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_eleventh_wrong_code_in_a_minute_is_throttled(): void
    {
        $this->actingAs($this->admin());
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/settings/monitor/pair', ['code' => '000000'])->assertStatus(422);
        }

        $this->postJson('/api/settings/monitor/pair', ['code' => '000000'])->assertStatus(429);
    }

    public function test_code_expires_after_five_minutes(): void
    {
        $pairing = $this->tvAsksForCode();
        $this->travel(301)->seconds();

        $this->actingAs($this->admin())->postJson('/api/settings/monitor/pair', ['code' => $pairing['code']])
            ->assertStatus(422)
            ->assertJsonPath('message', 'monitor_code_invalid');
        $this->assertSame(['status' => 'expired'], $this->tvPolls($pairing['pairing_id']));
    }

    public function test_a_used_code_cannot_pair_twice(): void
    {
        $admin = $this->admin();
        $pairing = $this->tvAsksForCode();
        $this->actingAs($admin)->postJson('/api/settings/monitor/pair', ['code' => $pairing['code']])->assertOk();

        $this->postJson('/api/settings/monitor/pair', ['code' => $pairing['code']])
            ->assertStatus(422)
            ->assertJsonPath('message', 'monitor_code_invalid');
    }

    public function test_pairing_again_invalidates_the_old_token(): void
    {
        $admin = $this->admin();
        $old = $this->pairTv($admin);
        $new = $this->pairTv($admin);
        auth()->forgetGuards();

        $this->withHeader('X-Monitor-Token', $old)->getJson('/api/monitor/board')->assertStatus(401);
        $this->withHeader('X-Monitor-Token', $new)->getJson('/api/monitor/board')->assertOk();
    }

    public function test_unpair_drops_the_device_and_writes_audit(): void
    {
        $admin = $this->admin();
        $token = $this->pairTv($admin);

        $this->actingAs($admin)->deleteJson('/api/settings/monitor/device')
            ->assertOk()
            ->assertJsonPath('data.paired', false);
        auth()->forgetGuards();

        $this->withHeader('X-Monitor-Token', $token)->getJson('/api/monitor/board')->assertStatus(401);
        $this->assertSame(
            ['Paired monitor screen', 'Unpaired monitor screen'],
            AuditLog::query()->orderBy('id')->pluck('action')->all(),
        );
    }

    public function test_settings_endpoints_need_settings_monitor(): void
    {
        $this->actingAs($this->userWith('settings_only', 'settings.access'));

        $this->getJson('/api/settings/monitor')->assertForbidden();
        $this->postJson('/api/settings/monitor/pair', ['code' => '123456'])->assertForbidden();
        $this->deleteJson('/api/settings/monitor/device')->assertForbidden();
    }

    public function test_status_reports_browser_and_last_seen(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->getJson('/api/settings/monitor')
            ->assertOk()
            ->assertJsonPath('data.paired', false)
            ->assertJsonPath('data.last_seen_at', null);

        $token = $this->pairTv($admin);
        auth()->forgetGuards();
        $this->withHeader('X-Monitor-Token', $token)->getJson('/api/monitor/board')->assertOk();

        $status = $this->actingAs($admin)->getJson('/api/settings/monitor')->assertOk()->json('data');
        $this->assertTrue($status['paired']);
        $this->assertSame('Chrome', $status['browser']);
        $this->assertNotNull($status['paired_at']);
        $this->assertNotNull($status['last_seen_at']);
    }
}
