<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    /** A user with the edit-own permission can update their display name (POST /api/profile). */
    public function test_profile_name_can_be_updated(): void
    {
        // Super accounts carry every permission, including employees.edit_own.
        $user = User::factory()->create(['role' => 'super']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['name' => 'Updated Name'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Name');

        $this->assertSame('Updated Name', $user->refresh()->name);
    }

    /** Name is required when updating the profile. */
    public function test_name_is_required(): void
    {
        $user = User::factory()->create(['role' => 'super']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['name' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    /** A user lacking employees.edit_own cannot update their profile. */
    public function test_users_without_permission_cannot_update_profile(): void
    {
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['name' => 'Nope'])
            ->assertForbidden();
    }
}
