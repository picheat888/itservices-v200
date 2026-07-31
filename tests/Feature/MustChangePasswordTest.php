<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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
            'password' => 'New-Secret123!',
            'password_confirmation' => 'New-Secret123!',
        ])->assertOk()->assertJsonPath('data.password_expired', false);

        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }

    /** The UI needs the reason, not just the fact, so it can explain the right one. */
    public function test_the_reason_is_exposed_separately_from_password_expired(): void
    {
        $flagged = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($flagged);
        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.password_expired', true)
            ->assertJsonPath('data.must_change_password', true);

        $normal = User::factory()->create();
        $this->actingAs($normal);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.must_change_password', false);
    }

    /**
     * On a forced change the current password is waived — the person authenticated with the
     * temporary one moments ago. Everyone else must still prove they know it, so an
     * unattended session can't be used to take an account over.
     */
    public function test_current_password_is_waived_only_while_the_flag_is_set(): void
    {
        $flagged = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($flagged);
        $this->putJson('/api/password', [
            'password' => 'New-Secret123!',
            'password_confirmation' => 'New-Secret123!',
        ])->assertOk();
        $this->assertTrue(Hash::check('New-Secret123!', $flagged->fresh()->password));

        // Same request without the flag is rejected for the missing current password.
        $normal = User::factory()->create();
        $this->actingAs($normal);
        $this->putJson('/api/password', [
            'password' => 'New-Secret123!',
            'password_confirmation' => 'New-Secret123!',
        ])->assertStatus(422)->assertJsonValidationErrors('current_password');
    }

    /** A forced change must not be allowed to weaken the account it was meant to protect. */
    public function test_own_password_change_honours_the_complexity_policy(): void
    {
        $user = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($user);

        foreach (['Sec12!', 'newsecret1!', 'NEWSECRET1!', 'NewSecretPass!', 'NewSecret123'] as $weak) {
            $this->putJson('/api/password', [
                'current_password' => 'password',
                'password' => $weak,
                'password_confirmation' => $weak,
            ])->assertStatus(422)->assertJsonValidationErrors('password');
        }

        $this->assertTrue((bool) $user->fresh()->must_change_password, 'the flag survives a rejected attempt');
    }
}
