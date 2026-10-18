<?php

// Renaming a Role Template: a null or omitted colour keeps the current one, a valid hex replaces it.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): Role
    {
        return Role::create(['key' => 'editor', 'name' => 'Editor', 'color' => '#111111', 'is_system' => false]);
    }

    public function test_a_null_colour_keeps_the_current_colour(): void
    {
        $role = $this->editor();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson("/api/roles/{$role->key}", ['name' => 'Lead Editor', 'color' => null])
            ->assertOk();

        $this->assertSame('Lead Editor', $role->fresh()->name);
        $this->assertSame('#111111', $role->fresh()->color);
    }

    public function test_an_omitted_colour_keeps_the_current_colour(): void
    {
        $role = $this->editor();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson("/api/roles/{$role->key}", ['name' => 'Lead Editor'])
            ->assertOk();

        $this->assertSame('Lead Editor', $role->fresh()->name);
        $this->assertSame('#111111', $role->fresh()->color);
    }

    public function test_a_valid_hex_colour_replaces_the_current_colour(): void
    {
        $role = $this->editor();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson("/api/roles/{$role->key}", ['name' => 'Editor', 'color' => '#22aa44'])
            ->assertOk();

        $this->assertSame('#22aa44', $role->fresh()->color);
    }
}
