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

    /** Invisible characters typed into the name do not buy new attempts: every spelling of the account shares one counter. */
    public function test_invisible_characters_in_the_name_share_the_accounts_counter(): void
    {
        $user = User::factory()->create(['username' => 'admin']);
        $spellings = ["ad\u{200B}min", "\u{200B}admin", "admin\u{200D}", "a\u{2060}dmin", "adm\u{FEFF}in"];

        foreach ($spellings as $spelling) {
            $this->postJson('/api/login', ['login' => $spelling, 'password' => 'wrong-password'])->assertStatus(422);
        }

        $this->postJson('/api/login', ['login' => 'admin', 'password' => 'password'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');
        $this->assertSame('admin', $user->username);
    }

    /** Refused by length before any lookup, not answered as a wrong password. */
    public function test_a_name_longer_than_255_characters_is_refused(): void
    {
        $response = $this->postJson('/api/login', ['login' => str_repeat('a', 256), 'password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('login');

        $this->assertNotSame(__('auth.failed'), $response->json('errors.login.0'));
    }

    /** The counter keys stay short whatever was typed, so the database cache can always store them. */
    public function test_counter_keys_stay_short_for_a_long_name(): void
    {
        User::factory()->create(['username' => 'admin']);
        $long = LoginRequest::create('/api/login', 'POST', ['login' => str_repeat('x', 255)]);
        $padded = LoginRequest::create('/api/login', 'POST', ['login' => 'admin'.str_repeat("\u{200B}", 240)]);
        $plain = LoginRequest::create('/api/login', 'POST', ['login' => 'admin']);

        $this->assertLessThan(120, strlen($long->throttleKey()));
        $this->assertLessThan(120, strlen($long->loginThrottleKey()));
        $this->assertSame($plain->throttleKey(), $padded->throttleKey());
        $this->assertSame($plain->loginThrottleKey(), $padded->loginThrottleKey());
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
