<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CheckPasswordExpiry has to be reachable to be worth anything.
 *
 * It existed but was never registered on a route group, so both the admin-forced
 * change and the expiry policy were enforced only by the dialog the SPA chooses to
 * show — anything calling the API directly sailed past both. These tests pin the
 * middleware to the authenticated group and, just as importantly, pin the four
 * routes that must stay open so a locked account can still let itself out.
 */
class PasswordExpiryEnforcementTest extends TestCase
{
    use RefreshDatabase;

    /** A route inside the authenticated group that needs no extra permission. */
    private const GUARDED_ROUTE = '/api/settings/security';

    private function user(array $attributes = []): User
    {
        Role::firstOrCreate(['key' => 'super'], ['name' => 'Administrator Template', 'is_system' => true]);

        return User::factory()->create([...['role' => 'super'], ...$attributes]);
    }

    public function test_an_account_owing_a_password_change_is_refused_on_normal_routes(): void
    {
        $user = $this->user(['must_change_password' => true]);

        $res = $this->actingAs($user)->getJson(self::GUARDED_ROUTE);

        $res->assertStatus(403);
        $res->assertJsonPath('message', 'password_expired');
    }

    public function test_it_can_still_read_its_own_profile(): void
    {
        $user = $this->user(['must_change_password' => true]);

        // Without this the SPA could never learn that it has to ask.
        $this->actingAs($user)->getJson('/api/me')->assertOk();
    }

    public function test_it_can_still_sign_out(): void
    {
        $user = $this->user(['must_change_password' => true]);

        // logout invalidates the session, so the request has to be a stateful one
        // for a session to exist at all (same Origin header AuthenticationTest uses).
        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/logout')
            ->assertOk();
    }

    public function test_it_can_still_reach_the_session_heartbeat(): void
    {
        $user = $this->user(['must_change_password' => true]);

        $this->actingAs($user)->getJson('/api/session/ping')->assertOk();
    }

    public function test_changing_the_password_lifts_the_block(): void
    {
        $user = $this->user(['must_change_password' => true]);

        // The forced flow does not re-ask for the current password.
        $this->actingAs($user)->putJson('/api/password', [
            'password' => 'NewPass1!',
            'password_confirmation' => 'NewPass1!',
        ])->assertOk();

        $this->assertFalse($user->fresh()->must_change_password);
        $this->actingAs($user->fresh())->getJson(self::GUARDED_ROUTE)->assertOk();
    }

    public function test_an_expired_password_is_refused_once_the_policy_is_on(): void
    {
        AppSetting::put('password_expiry_days', '30');
        $user = $this->user(['password_changed_at' => now()->subDays(40)]);

        $this->actingAs($user)->getJson(self::GUARDED_ROUTE)
            ->assertStatus(403)
            ->assertJsonPath('message', 'password_expired');
    }

    /** A password that has never been changed counts as expired while the policy is on. */
    public function test_a_password_that_was_never_changed_is_refused_under_the_policy(): void
    {
        AppSetting::put('password_expiry_days', '30');
        $user = $this->user(['password_changed_at' => null]);

        $this->actingAs($user)->getJson(self::GUARDED_ROUTE)->assertStatus(403);
    }

    public function test_a_password_inside_the_policy_window_passes(): void
    {
        AppSetting::put('password_expiry_days', '30');
        $user = $this->user(['password_changed_at' => now()->subDays(5)]);

        $this->actingAs($user)->getJson(self::GUARDED_ROUTE)->assertOk();
    }

    /** With the policy off, age is irrelevant — only an admin-forced change blocks. */
    public function test_the_policy_being_off_lets_an_old_password_through(): void
    {
        AppSetting::put('password_expiry_days', '0');
        $user = $this->user(['password_changed_at' => now()->subYears(3)]);

        $this->actingAs($user)->getJson(self::GUARDED_ROUTE)->assertOk();
    }
}
