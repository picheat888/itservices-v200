<?php

namespace Tests\Feature\Auth;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Inactivity session-timeout policy (CheckSessionTimeout). When enabled, a
 * session idle longer than the configured window is force-expired with 401
 * "session_expired" so the SPA bounces the user back to login.
 */
class SessionTimeoutTest extends TestCase
{
    use RefreshDatabase;

    /** An idle session past the window is invalidated and rejected. */
    public function test_idle_session_past_the_window_is_expired(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000') // stateful → session middleware runs
            ->withSession(['_sec_last_activity' => time() - 31 * 60]) // 31 min idle > 30
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJsonPath('message', 'session_expired');
    }

    /** Activity within the window passes and the endpoint serves normally. */
    public function test_recent_activity_within_the_window_passes(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000')
            ->withSession(['_sec_last_activity' => time() - 5 * 60]) // 5 min idle < 30
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    /** With the policy disabled (0), even an ancient session is allowed through. */
    public function test_policy_disabled_never_expires(): void
    {
        AppSetting::put('session_timeout_minutes', '0');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000')
            ->withSession(['_sec_last_activity' => time() - 999 * 60])
            ->getJson('/api/me')
            ->assertOk();
    }
}
