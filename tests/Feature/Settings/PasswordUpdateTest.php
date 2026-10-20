<?php

namespace Tests\Feature\Settings;

use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class PasswordUpdateTest extends TestCase
{
    use RefreshDatabase;

    /** A correct current password lets the user set a new one (PUT /api/password). */
    public function test_password_can_be_updated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/password', [
                'current_password' => 'password',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('New-Password1!', $user->refresh()->password));
    }

    /** A wrong current password is rejected and the password is left unchanged. */
    public function test_correct_password_must_be_provided_to_update_password(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/password', [
                'current_password' => 'wrong-password',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    /** @return array<string, string> */
    private static function change(string $current): array
    {
        return ['current_password' => $current, 'password' => 'New-Password1!', 'password_confirmation' => 'New-Password1!'];
    }

    /** A wrong current password counts toward the account's sign-in lockout; once it is full, the change is refused too. */
    public function test_a_wrong_current_password_counts_toward_the_account_lockout(): void
    {
        $user = User::factory()->create();
        $key = LoginRequest::accountThrottleKey($user);
        RateLimiter::increment($key, LoginRequest::LOGIN_LOCKOUT_SECONDS, LoginRequest::MAX_ATTEMPTS_PER_LOGIN - 1);

        $this->actingAs($user)->putJson('/api/password', self::change('wrong-password'))->assertStatus(422);
        $this->assertTrue(RateLimiter::tooManyAttempts($key, LoginRequest::MAX_ATTEMPTS_PER_LOGIN));

        $refused = $this->actingAs($user)->putJson('/api/password', self::change('password'))
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');
        $this->assertGreaterThan(0, $refused->json('retry_after'));
        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    /** Guesses made through a stolen session lock the account's sign-in as well. */
    public function test_wrong_current_passwords_lock_sign_in_too(): void
    {
        $user = User::factory()->create();
        RateLimiter::increment(LoginRequest::accountThrottleKey($user), LoginRequest::LOGIN_LOCKOUT_SECONDS, LoginRequest::MAX_ATTEMPTS_PER_LOGIN - 1);

        $this->actingAs($user)->putJson('/api/password', self::change('wrong-password'))->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $this->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');
    }

    public function test_password_changes_are_capped_at_five_a_minute(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user)->putJson('/api/password', self::change('wrong-password'))->assertStatus(422);
        }

        $this->actingAs($user)->putJson('/api/password', self::change('password'))
            ->assertStatus(429)
            ->assertJsonPath('message', 'too_many_attempts');
        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    public function test_a_successful_change_clears_the_account_counter(): void
    {
        $user = User::factory()->create();
        $key = LoginRequest::accountThrottleKey($user);
        RateLimiter::increment($key, LoginRequest::LOGIN_LOCKOUT_SECONDS, 3);

        $this->actingAs($user)->putJson('/api/password', self::change('password'))->assertOk();

        $this->assertSame(0, RateLimiter::attempts($key));
    }
}
