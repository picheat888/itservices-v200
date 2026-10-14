<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\CheckSessionTimeout;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Inactivity timeout (CheckSessionTimeout): the last-activity time lives in the cache, only a ping or a
 * write counts as activity, and the server allows a heartbeat of grace so the browser always signs out first.
 */
class SessionTimeoutTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private const CLOCK = 'test-clock';

    /** A session whose idle clock last moved $secondsAgo seconds ago. */
    private function idleFor(int $secondsAgo): static
    {
        Cache::put(CheckSessionTimeout::clockKey(self::CLOCK), time() - $secondsAgo, 3600);

        return $this->withHeader('Origin', self::ORIGIN)->withSession([CheckSessionTimeout::IDLE_CLOCK => self::CLOCK]);
    }

    private function lastActivity(): ?int
    {
        return Cache::get(CheckSessionTimeout::clockKey(self::CLOCK));
    }

    public function test_idle_session_past_the_window_and_grace_is_expired(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->idleFor(30 * 60 + CheckSessionTimeout::GRACE_SECONDS + 1)
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJsonPath('message', 'session_expired');

        $this->assertNull($this->lastActivity());
    }

    public function test_recent_activity_within_the_window_passes(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->idleFor(5 * 60)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    /** The browser warns and signs out on time; the server only steps in after a heartbeat of grace. */
    public function test_just_past_the_window_is_still_within_the_grace(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->idleFor(30 * 60 + 30)
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_policy_disabled_never_expires(): void
    {
        AppSetting::put('session_timeout_minutes', '0');

        $this->actingAs(User::factory()->create())
            ->idleFor(999 * 60)
            ->getJson('/api/me')
            ->assertOk();
    }

    /** Reads the page makes on its own (polls, refetches) are not activity. */
    public function test_a_get_request_does_not_count_as_activity(): void
    {
        AppSetting::put('session_timeout_minutes', '30');
        $idleSince = time() - 20 * 60;

        $this->actingAs(User::factory()->create())->idleFor(20 * 60)->getJson('/api/me')->assertOk();

        $this->assertSame($idleSince, $this->lastActivity());
    }

    public function test_a_get_request_past_the_window_is_expired(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->idleFor(40 * 60)
            ->getJson('/api/sidebar-badges')
            ->assertStatus(401)
            ->assertJsonPath('message', 'session_expired');
    }

    /** The browser pings on real activity. */
    public function test_the_ping_counts_as_activity(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())->idleFor(20 * 60)->getJson('/api/session/ping')->assertOk();

        $this->assertGreaterThanOrEqual(time() - 5, $this->lastActivity());
    }

    public function test_a_write_counts_as_activity(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())->idleFor(20 * 60)->putJson('/api/preferences', ['dark' => true])->assertOk();

        $this->assertGreaterThanOrEqual(time() - 5, $this->lastActivity());
    }

    /** The time is kept outside the session payload, so a request saving an older copy of the session cannot undo a ping. */
    public function test_a_stale_session_payload_cannot_undo_activity(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->idleFor(60)
            ->withSession(['_sec_last_activity' => time() - 40 * 60])
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_the_first_request_starts_the_clock(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())->withHeader('Origin', self::ORIGIN)->getJson('/api/me')->assertOk();

        $clock = session(CheckSessionTimeout::IDLE_CLOCK);
        $this->assertNotNull($clock);
        $this->assertGreaterThanOrEqual(time() - 5, Cache::get(CheckSessionTimeout::clockKey($clock)));
    }

    /** A clock whose time is gone from the cache is treated as expired, never restarted. */
    public function test_a_started_clock_with_no_time_left_in_the_cache_is_expired(): void
    {
        AppSetting::put('session_timeout_minutes', '30');

        $this->actingAs(User::factory()->create())
            ->withHeader('Origin', self::ORIGIN)
            ->withSession([CheckSessionTimeout::IDLE_CLOCK => 'lost-clock'])
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJsonPath('message', 'session_expired');
    }
}
