<?php

// The SQL permission scopes on User pick the same people as hasPermission(), and the
// Ticket staff list loads in a fixed number of queries however many accounts exist.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class UserPermissionScopeTest extends TestCase
{
    use RefreshDatabase;

    private function roleWith(string $key, array $permissions): void
    {
        $role = Role::create(['key' => $key, 'name' => $key, 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $permission => $allowed) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => $allowed]);
        }
    }

    private function seedRoles(): void
    {
        $this->roleWith('email_editor', ['access.module' => true, 'access.email_edit' => true]);
        $this->roleWith('viewer_only', ['access.module' => true, 'access.email_edit' => false]);
        $this->roleWith('edit_no_module', ['access.file_edit' => true]);

        User::factory()->create(['role' => 'super']);
        User::factory()->create(['role' => 'email_editor']);
        User::factory()->create(['role' => 'viewer_only']);
        User::factory()->create(['role' => 'edit_no_module']);
        User::factory()->create(['role' => null]);
    }

    /** @return list<int> */
    private function ids(iterable $users): array
    {
        return collect($users)->pluck('id')->sort()->values()->all();
    }

    public function test_holding_any_permission_matches_has_permission(): void
    {
        $this->seedRoles();
        $editKeys = ['access.email_edit', 'access.file_edit', 'access.social_edit', 'access.software_edit'];

        $expected = User::all()->filter(fn (User $u) => collect($editKeys)->contains(fn (string $key) => $u->hasPermission($key)));

        $this->assertSame($this->ids($expected), $this->ids(User::holdingAnyPermission($editKeys)->get()));
    }

    public function test_chained_scopes_require_every_condition(): void
    {
        $this->seedRoles();
        $editKeys = ['access.email_edit', 'access.file_edit', 'access.social_edit', 'access.software_edit'];

        $expected = User::all()->filter(
            fn (User $u) => $u->hasPermission('access.module')
                && collect($editKeys)->contains(fn (string $key) => $u->hasPermission($key))
        );
        $actual = User::holdingPermission('access.module')->holdingAnyPermission($editKeys)->get();

        // Super and the email editor; the viewer lacks an edit key, the file editor lacks the module.
        $this->assertCount(2, $actual);
        $this->assertSame($this->ids($expected), $this->ids($actual));
    }

    public function test_ticket_staff_list_query_count_does_not_grow_with_accounts(): void
    {
        $this->roleWith('desk', ['tickets.resolve' => true, 'tickets.level_hardware' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        $count = function () use ($admin): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($admin)->getJson('/api/tickets/staff?category=hardware')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        User::factory()->count(2)->create(['role' => 'desk']);
        $count(); // warm up the per-request caches
        $few = $count();
        User::factory()->count(8)->create(['role' => 'desk']);
        $many = $count();

        $this->assertSame($few, $many);
    }
}
