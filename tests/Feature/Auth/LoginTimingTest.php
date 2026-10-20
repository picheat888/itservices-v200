<?php

namespace Tests\Feature\Auth;

use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

// Sign-in timing (S7): an unknown login costs the same hash check as a wrong password, and only a right one skips the timebox.
class LoginTimingTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private function signIn(string $login, string $password): TestResponse
    {
        return $this->withHeader('Origin', self::ORIGIN)->postJson('/api/login', ['login' => $login, 'password' => $password]);
    }

    public function test_an_unknown_login_is_checked_against_the_stand_in_hash(): void
    {
        $standIn = LoginRequest::standInHash();
        $hash = Hash::partialMock();
        $hash->shouldReceive('needsRehash')->andReturnFalse();
        $hash->shouldReceive('check')->once()->with('Guess-1234', $standIn)->andReturnFalse();

        $this->signIn('nobody.here', 'Guess-1234')->assertStatus(422)->assertJsonValidationErrors('login');
    }

    public function test_the_stand_in_hash_is_made_once_at_the_current_cost(): void
    {
        $first = LoginRequest::standInHash();

        $this->assertSame($first, Cache::get(LoginRequest::STAND_IN_HASH_KEY));
        $this->assertFalse(Hash::needsRehash($first));
        $this->assertSame($first, LoginRequest::standInHash());
    }

    public function test_a_stand_in_hash_of_another_cost_is_made_again(): void
    {
        Cache::forever(LoginRequest::STAND_IN_HASH_KEY, password_hash('old', PASSWORD_BCRYPT, ['cost' => 5]));

        $hash = LoginRequest::standInHash();

        $this->assertFalse(Hash::needsRehash($hash));
        $this->assertSame($hash, Cache::get(LoginRequest::STAND_IN_HASH_KEY));
    }

    /** Unknown and wrong answers wait out the timebox; a right password does not. */
    public function test_only_a_right_password_skips_the_timebox(): void
    {
        $user = User::factory()->create();
        Sleep::fake();

        $this->signIn('nobody.here', 'Guess-1234')->assertStatus(422);
        $this->signIn($user->email, 'wrong-password')->assertStatus(422);
        Sleep::assertSleptTimes(2);

        $this->app['auth']->forgetGuards();
        $this->signIn($user->email, 'password')->assertOk();
        Sleep::assertSleptTimes(2);
    }
}
