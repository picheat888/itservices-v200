<?php

namespace Tests\Feature\Auth;

use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Security-focused coverage for the sign-in endpoint: brute-force throttling,
 * resistance to username enumeration, and the username login path.
 */
class LoginSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear((new LoginRequest)->throttleKey());
    }

    /** After 5 failed attempts the account+IP is locked — even a correct password is refused. */
    public function test_login_is_throttled_after_five_failed_attempts(): void
    {
        $user = User::factory()->create();

        // Burn the 5 allowed attempts with the wrong password.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['login' => $user->email, 'password' => 'wrong-password'])
                ->assertStatus(422);
        }

        // The 6th attempt is locked out even though the password is now correct.
        $response = $this->postJson('/api/login', ['login' => $user->email, 'password' => 'password']);

        // 429 + a message code (not a 422 validation error): the SPA has to tell a lockout
        // apart from a wrong password to show the right message and the remaining wait.
        $response->assertStatus(429)->assertJsonPath('message', 'too_many_attempts');
        $this->assertGreaterThan(0, $response->json('retry_after'));
        $this->assertGreaterThan(0, (int) $response->headers->get('Retry-After'));
        $this->assertGuest();
    }

    /** An unknown user and a wrong password return the SAME error — no account enumeration. */
    public function test_login_does_not_leak_whether_an_account_exists(): void
    {
        $user = User::factory()->create();

        $wrongPassword = $this->postJson('/api/login', ['login' => $user->email, 'password' => 'wrong-password']);
        $unknownUser = $this->postJson('/api/login', ['login' => 'ghost@nowhere.test', 'password' => 'wrong-password']);

        $wrongPassword->assertStatus(422)->assertJsonValidationErrors('login');
        $unknownUser->assertStatus(422)->assertJsonValidationErrors('login');

        // Identical message for both cases — an attacker cannot tell them apart.
        $this->assertSame(
            $wrongPassword->json('errors.login.0'),
            $unknownUser->json('errors.login.0'),
        );
    }

    /** Username-based accounts (no email) can sign in with their username. */
    public function test_users_can_authenticate_with_a_username(): void
    {
        $user = User::factory()->create(['username' => 'someone', 'email' => null]);

        $this->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/login', ['login' => 'someone', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $this->assertAuthenticated();
    }

    /** Credentials are required — blank submissions are rejected by validation. */
    public function test_login_requires_both_fields(): void
    {
        $this->postJson('/api/login', ['login' => '', 'password' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['login', 'password']);
    }
}
