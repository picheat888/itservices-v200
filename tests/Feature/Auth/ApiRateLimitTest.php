<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The standard API throttle (60 requests/minute, keyed per user or IP) applies
 * to every API route. Exceeding it returns HTTP 429.
 */
class ApiRateLimitTest extends TestCase
{
    use RefreshDatabase;

    /** Normal responses advertise the limit via the standard rate-limit headers. */
    public function test_responses_carry_rate_limit_headers(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertHeader('X-RateLimit-Limit', 60);
    }

    /** The 61st request within a minute (same user) is throttled with 429. */
    public function test_api_is_throttled_after_sixty_requests_per_minute(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 60; $i++) {
            $this->actingAs($user)->getJson('/api/me')->assertOk();
        }

        $this->actingAs($user)->getJson('/api/me')->assertStatus(429);
    }
}
