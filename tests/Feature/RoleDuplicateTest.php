<?php

// Duplicating a role template: a new custom role with the source's saved permissions, never its members or super status.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleDuplicateTest extends TestCase
{
    use RefreshDatabase;

    private Role $staff;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator', 'is_system' => true]);
        $this->staff = Role::create(['key' => 'staff', 'name' => 'Staff', 'color' => '#059669', 'is_system' => false]);
    }

    private function grant(Role $role, string ...$keys): void
    {
        foreach ($keys as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => true]);
        }
    }

    /** @return list<string> */
    private function allowedOf(string $key): array
    {
        $keys = Role::where('key', $key)->firstOrFail()->allowedKeys();
        sort($keys);

        return $keys;
    }

    public function test_create_rename_and_duplicate_answer_with_the_role_resource_only(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $shape = ['key', 'name', 'color', 'is_system'];

        $created = $this->postJson('/api/roles', ['name' => 'Desk', 'color' => '#2563eb'])->assertCreated()->json('data');
        $this->assertSame($shape, array_keys($created));
        $this->assertSame(['key' => 'desk', 'name' => 'Desk', 'color' => '#2563eb', 'is_system' => false], $created);

        $renamed = $this->putJson('/api/roles/desk', ['name' => 'Help desk', 'color' => '#2563eb'])->assertOk()->json('data');
        $this->assertSame($shape, array_keys($renamed));
        $this->assertSame('Help desk', $renamed['name']);

        $copy = $this->postJson('/api/roles/staff/duplicate', ['name' => 'Staff two'])->assertCreated()->json('data');
        $this->assertSame($shape, array_keys($copy));
    }

    public function test_a_duplicate_carries_the_saved_permissions_but_no_members(): void
    {
        $this->grant($this->staff, 'tickets.view_all', 'tickets.create');
        User::factory()->create(['role' => 'staff']);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/roles/staff/duplicate', ['name' => 'Staff (copy)', 'color' => '#0c9d8c'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Staff (copy)')
            ->assertJsonPath('data.color', '#0c9d8c')
            ->assertJsonPath('data.is_system', false);

        $copy = Role::where('name', 'Staff (copy)')->firstOrFail();
        $this->assertSame(['tickets.create', 'tickets.view_all'], $this->allowedOf($copy->key));
        $this->assertSame(0, User::where('role_id', $copy->id)->count());
        $this->assertSame(['tickets.create', 'tickets.view_all'], $this->allowedOf('staff'));
        $this->assertTrue(AuditLog::where('action', 'Duplicated role')->exists());
    }

    public function test_duplicating_the_administrator_copies_the_whole_catalogue_without_super_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/roles/super/duplicate', ['name' => 'Admin copy'])
            ->assertCreated()
            ->assertJsonPath('data.is_system', false);

        $copy = Role::where('name', 'Admin copy')->firstOrFail();
        $this->assertNotSame('super', $copy->key);
        $all = Permissions::all();
        sort($all);
        $this->assertSame($all, $this->allowedOf($copy->key));
    }

    public function test_a_manager_cannot_duplicate_a_role_holding_permissions_they_lack(): void
    {
        $manager = Role::create(['key' => 'manager', 'name' => 'Manager', 'is_system' => false]);
        $this->grant($manager, 'system.manage_roles', 'tickets.view_all');
        $this->grant($this->staff, 'tickets.view_all', 'assets.view');

        $this->actingAs(User::factory()->create(['role' => 'manager']))
            ->postJson('/api/roles/staff/duplicate', ['name' => 'Too much'])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertFalse(Role::where('name', 'Too much')->exists());
    }

    public function test_a_manager_can_duplicate_a_role_within_their_own_permissions(): void
    {
        $manager = Role::create(['key' => 'manager', 'name' => 'Manager', 'is_system' => false]);
        $this->grant($manager, 'system.manage_roles', 'tickets.view_all');
        $this->grant($this->staff, 'tickets.view_all');

        $this->actingAs(User::factory()->create(['role' => 'manager']))
            ->postJson('/api/roles/staff/duplicate', ['name' => 'Within'])
            ->assertCreated();
    }

    public function test_it_needs_the_manage_roles_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'staff']))
            ->postJson('/api/roles/staff/duplicate', ['name' => 'Nope'])
            ->assertForbidden();
    }

    public function test_the_new_key_never_collides_with_an_existing_role(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/roles/staff/duplicate', ['name' => 'Staff'])->assertCreated();
        $this->assertSame(2, Role::where('name', 'Staff')->count());
        $this->assertSame(2, Role::where('key', 'like', 'staff%')->count());
    }

    public function test_a_name_is_required_and_an_unknown_role_is_not_found(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/roles/staff/duplicate', ['name' => ''])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/roles/nobody/duplicate', ['name' => 'X'])->assertNotFound();
    }
}
