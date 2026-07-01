<?php

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Employee;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    /** Seed each role's default permissions into role_permissions (mirrors DatabaseSeeder). */
    protected function seedDefaultPermissions(): void
    {
        foreach (Permissions::defaults() as $roleKey => $granted) {
            $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey)])->id;
            foreach ($granted as $permission) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true],
                );
            }
        }
    }

    public function test_access_tables_exist_with_expected_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('email_groups', ['code', 'name', 'email', 'department_id', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('file_shares', ['code', 'name', 'path', 'size_label', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('social_platforms', ['code', 'name', 'url', 'color', 'policy']));
        $this->assertTrue(Schema::hasColumns('access_memberships', ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'revoked_at']));
    }

    public function test_access_permission_keys_are_registered(): void
    {
        $this->assertContains('access.view', Permissions::all());
        $this->assertContains('access.manage', Permissions::all());
        $this->assertContains('access.manage', Permissions::defaults()['admin']);
    }

    public function test_models_auto_code_and_relations(): void
    {
        $g = EmailGroup::create(['name' => 'QA Team', 'email' => 'qa@x.co']);
        $this->assertStringStartsWith('MG-', $g->fresh()->code);

        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R']);
        $this->assertStringStartsWith('FS-', $fs->fresh()->code);

        $sp = SocialPlatform::create(['name' => 'LINE']);
        $this->assertStringStartsWith('SM-', $sp->fresh()->code);

        $emp = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $g->memberships()->create(['employee_id' => $emp->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);
        $this->assertTrue($g->memberships()->whereNull('revoked_at')->exists());
        $this->assertSame($emp->id, $m->employee->id);
        $this->assertInstanceOf(EmailGroup::class, $m->resource);
    }

    public function test_manage_permission_required_to_create_group(): void
    {
        $this->seedDefaultPermissions();

        // user role lacks access.manage
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->postJson('/api/email-groups', ['name' => 'X', 'email' => 'x@x.co'])->assertForbidden();

        // admin role has it
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'qa@x.co'])
            ->assertStatus(201)
            ->assertJsonPath('data.code', fn ($c) => str_starts_with($c, 'MG-'));
    }

    public function test_grant_and_soft_revoke_member(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->postJson("/api/email-groups/{$g->id}/members", ['employee_id' => $e->id, 'access_level' => 'Member'])
            ->assertStatus(201)->json('data.id');

        $this->postJson("/api/email-groups/{$g->id}/members/{$m}/revoke")->assertOk();
        $this->assertNotNull(AccessMembership::find($m)->revoked_at);
    }

    public function test_cannot_delete_group_with_active_members(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->deleteJson("/api/email-groups/{$g->id}")->assertStatus(422)->assertJsonPath('message', 'resource_has_members');
    }
}
