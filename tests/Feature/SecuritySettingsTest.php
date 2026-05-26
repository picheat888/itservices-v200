<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSessionTimeout;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecuritySettingsTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super', 'password' => Hash::make('password')]);
    }

    public function test_guests_cannot_read_security_settings(): void
    {
        $this->getJson('/api/settings/security')->assertUnauthorized();
    }

    public function test_security_settings_default_to_disabled(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/settings/security')
            ->assertOk()
            ->assertJsonPath('data.session_timeout_minutes', 0)
            ->assertJsonPath('data.password_expiry_days', 0);
    }

    public function test_super_can_update_security_settings(): void
    {
        $this->actingAs($this->super());

        $this->putJson('/api/settings/security', [
            'session_timeout_minutes' => 30,
            'password_expiry_days' => 90,
        ])
            ->assertOk()
            ->assertJsonPath('data.session_timeout_minutes', 30)
            ->assertJsonPath('data.password_expiry_days', 90);

        $this->assertSame('30', AppSetting::get('session_timeout_minutes'));
        $this->assertSame('90', AppSetting::get('password_expiry_days'));
    }

    public function test_non_super_cannot_update_security_settings(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->putJson('/api/settings/security', [
            'session_timeout_minutes' => 30,
            'password_expiry_days' => 90,
        ])->assertForbidden();
    }

    public function test_change_password_rejects_wrong_current_password(): void
    {
        $this->actingAs($this->super());

        $this->putJson('/api/password', [
            'current_password' => 'wrong-password',
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertStatus(422);
    }

    public function test_change_password_updates_hash_and_timestamp(): void
    {
        $user = $this->super();
        $this->actingAs($user);

        $this->putJson('/api/password', [
            'current_password' => 'password',
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertOk();

        $user->refresh();
        $this->assertTrue(Hash::check('new-secret-123', $user->password));
        $this->assertNotNull($user->password_changed_at);
    }

    public function test_me_reports_password_expired_when_policy_exceeded(): void
    {
        AppSetting::put('password_expiry_days', '30');

        $user = User::factory()->create([
            'role' => 'user',
            'password_changed_at' => now()->subDays(40),
        ]);
        $this->actingAs($user);

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.password_expired', true);
    }

    public function test_me_reports_not_expired_when_recently_changed(): void
    {
        AppSetting::put('password_expiry_days', '30');

        $user = User::factory()->create([
            'role' => 'user',
            'password_changed_at' => now()->subDays(5),
        ]);
        $this->actingAs($user);

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.password_expired', false);
    }

    /** Builds a session-backed request for the given user to drive the middleware directly. */
    private function sessionRequest(User $user, ?int $lastActivity): Request
    {
        $request = Request::create('/api/me', 'GET');
        $session = new Store('test', new ArraySessionHandler(120));
        if ($lastActivity !== null) {
            $session->put('_sec_last_activity', $lastActivity);
        }
        $request->setLaravelSession($session);
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    public function test_idle_session_times_out_with_401_not_500(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $request = $this->sessionRequest(User::factory()->create(), time() - 31 * 60);

        $response = (new CheckSessionTimeout)
            ->handle($request, fn () => response('next'));

        $this->assertSame(401, $response->getStatusCode());
        $this->assertStringContainsString('session_expired', (string) $response->getContent());
    }

    public function test_active_session_within_timeout_passes(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $request = $this->sessionRequest(User::factory()->create(), time() - 60);

        $response = (new CheckSessionTimeout)
            ->handle($request, fn () => response('next'));

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('next', (string) $response->getContent());
    }

    public function test_session_timeout_skips_when_policy_disabled(): void
    {
        AppSetting::put('session_timeout_minutes', '0');
        $request = $this->sessionRequest(User::factory()->create(), time() - 999999);

        $response = (new CheckSessionTimeout)
            ->handle($request, fn () => response('next'));

        $this->assertSame(200, $response->getStatusCode());
    }
}
