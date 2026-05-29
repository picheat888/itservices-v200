<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RoleReferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_table_has_role_id_column(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'role_id'));
        $this->assertTrue(Schema::hasColumn('group_roles', 'role_id'));
        $this->assertTrue(Schema::hasColumn('role_permissions', 'role_id'));
    }

    public function test_user_role_relation_and_super_check_work_by_id(): void
    {
        $super = Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#000', 'is_system' => true]);
        $staff = Role::create(['key' => 'user', 'name' => 'Staff', 'color' => '#111', 'is_system' => false]);

        $admin = User::factory()->create(['role' => 'super']);
        $plain = User::factory()->create(['role' => 'user']);

        $this->assertSame($super->id, $admin->role_id);
        $this->assertSame('super', $admin->role->key);
        $this->assertTrue($admin->isSuper());
        $this->assertFalse($plain->isSuper());
        $this->assertSame(1, $super->members());
    }
}
