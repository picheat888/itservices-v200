<?php

namespace Tests\Feature\Settings;

use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    /** A user with the edit-own permission can update their display name (POST /api/profile). */
    public function test_profile_name_can_be_updated(): void
    {
        // Super accounts carry every permission, including profile.edit.
        $user = User::factory()->create(['role' => 'super']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['first_name' => 'Updated', 'last_name' => 'Name'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Name');

        $this->assertSame('Updated Name', $user->refresh()->name);
    }

    /** First/last name are required when updating the profile. */
    public function test_name_is_required(): void
    {
        $user = User::factory()->create(['role' => 'super']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['first_name' => '', 'last_name' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    /** A user lacking profile.edit cannot update their profile. */
    public function test_users_without_permission_cannot_update_profile(): void
    {
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)
            ->postJson('/api/profile', ['first_name' => 'Nope', 'last_name' => 'Nope'])
            ->assertForbidden();
    }

    /** The retired employees.edit_own key opens nothing; profile.edit does. */
    public function test_profile_edit_is_the_key_that_allows_it(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'employees.edit_own', 'allowed' => true]);

        $this->actingAs($user)
            ->postJson('/api/profile', ['first_name' => 'Old', 'last_name' => 'Key'])
            ->assertForbidden();

        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'profile.edit', 'allowed' => true]);

        $this->actingAs($user->refresh())
            ->postJson('/api/profile', ['first_name' => 'New', 'last_name' => 'Key'])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Key');
    }
}
