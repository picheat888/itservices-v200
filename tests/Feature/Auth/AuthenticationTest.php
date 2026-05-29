<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    /** A valid email + password returns the signed-in user and starts a session. */
    public function test_users_can_authenticate_via_the_api(): void
    {
        $user = User::factory()->create();

        // A stateful Origin makes Sanctum attach the session middleware, just as
        // the real SPA does when it posts credentials.
        $this->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/login', [
                'login' => $user->email,
                'password' => 'password',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('message', 'success');

        $this->assertAuthenticated();
    }

    /** A wrong password fails validation on the `login` field and leaves the user a guest. */
    public function test_users_cannot_authenticate_with_an_invalid_password(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/login', [
            'login' => $user->email,
            'password' => 'wrong-password',
        ])->assertStatus(422)->assertJsonValidationErrors('login');

        $this->assertGuest();
    }

    /** The authenticated user can read their own account via /api/me. */
    public function test_authenticated_user_can_fetch_their_profile(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    /** Guests cannot read /api/me. */
    public function test_guests_cannot_fetch_a_profile(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    /** Logout returns success for an authenticated user. */
    public function test_users_can_logout(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/logout')
            ->assertOk()
            ->assertJsonPath('message', 'success');
    }
}
