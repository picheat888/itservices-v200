<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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
}
