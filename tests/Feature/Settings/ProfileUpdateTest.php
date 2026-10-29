<?php

namespace Tests\Feature\Settings;

use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_linked_employee_gets_names_and_phone(): void
    {
        $employee = Employee::create(['first_name' => 'Old', 'last_name' => 'Name', 'phone' => '111']);
        $user = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        $this->actingAs($user)
            ->postJson('/api/profile', ['first_name' => 'Anan', 'last_name' => 'Dee', 'first_name_th' => 'อนันต์', 'last_name_th' => 'ดี', 'phone' => '0812345678'])
            ->assertOk();

        $employee->refresh();
        $this->assertSame(['Anan', 'Dee', 'อนันต์', 'ดี', '0812345678'], [$employee->first_name, $employee->last_name, $employee->first_name_th, $employee->last_name_th, $employee->phone]);
    }

    public function test_new_photo_replaces_the_old_file(): void
    {
        Storage::fake('local');
        $employee = Employee::create(['first_name' => 'Photo', 'last_name' => 'Owner']);
        $user = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);
        $body = fn (string $name) => ['first_name' => 'Photo', 'last_name' => 'Owner', 'photo' => UploadedFile::fake()->image($name)];

        $this->actingAs($user)->post('/api/profile', $body('a.jpg'), ['Accept' => 'application/json'])->assertOk();
        $first = $employee->refresh()->photo_path;
        Storage::disk('local')->assertExists($first);

        $this->actingAs($user)->post('/api/profile', $body('b.jpg'), ['Accept' => 'application/json'])->assertOk();
        $second = $employee->refresh()->photo_path;

        $this->assertNotSame($first, $second);
        Storage::disk('local')->assertMissing($first);
        Storage::disk('local')->assertExists($second);
    }
}
