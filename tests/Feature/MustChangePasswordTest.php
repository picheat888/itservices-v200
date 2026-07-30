<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MustChangePasswordTest extends TestCase
{
    use RefreshDatabase;

    public function test_flag_marks_password_expired_even_with_policy_off(): void
    {
        $flagged = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($flagged);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.password_expired', true);

        $normal = User::factory()->create();
        $this->actingAs($normal);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.password_expired', false);
    }

    public function test_changing_own_password_clears_the_flag(): void
    {
        // Factory default password is "password".
        $user = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($user);

        $this->putJson('/api/password', [
            'current_password' => 'password',
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertOk()->assertJsonPath('data.password_expired', false);

        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }
}
