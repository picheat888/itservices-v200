<?php

// Security tests for the Permission module: strict role keys, privilege-escalation guards.

namespace Tests\Feature;

use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\RoleKeys;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Role::create(['key' => 'staff', 'name' => 'Staff', 'is_system' => false]);
    }

    /** Creates a non-super user and grants it the given permission keys. */
    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'staff']);
        $staffRole = Role::where('key', 'staff')->first();
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $staffRole->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    public function test_role_keys_resolver_matches_exactly(): void
    {
        $this->assertSame('super', RoleKeys::find('super')?->key);
        $this->assertNull(RoleKeys::find('SUPER'));
        $this->assertNull(RoleKeys::find('Super'));
        $this->assertNull(RoleKeys::find(null));
        $this->assertNull(RoleKeys::find(''));
    }

    public function test_role_key_case_variant_is_refused_for_group_writes(): void
    {
        $caller = $this->userWith('system.manage_groups');
        $this->actingAs($caller);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);

        foreach (['SUPER', 'Super'] as $variant) {
            $this->postJson('/api/group-roles', ['name' => 'Sneaky', 'role' => $variant])
                ->assertUnprocessable();

            $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => $variant, 'employee_ids' => []])
                ->assertUnprocessable();
        }

        $this->assertDatabaseMissing('group_roles', ['name' => 'Sneaky']);
        $this->assertSame('staff', $ordinary->fresh()->role->key);
        $this->assertFalse($caller->fresh()->isSuper());
    }

    public function test_permission_save_needs_the_exact_role_key(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));
        $superId = Role::where('key', 'super')->value('id');

        $this->putJson('/api/permissions/SUPER', ['permissions' => ['system.manage_roles']])
            ->assertNotFound();

        $this->assertDatabaseMissing('role_permissions', ['role_id' => $superId]);
    }
}
