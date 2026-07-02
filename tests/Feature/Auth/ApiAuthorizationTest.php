<?php

namespace Tests\Feature\Auth;

use App\Models\Permission\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Broken-access-control coverage for the REST API: being authenticated is not
 * enough โ€” a signed-in user who lacks the required permission must be refused
 * (403) on write endpoints across every module, before any action is taken.
 */
class ApiAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    /** A signed-in account whose role grants no permissions and is not the super bypass. */
    private function powerlessUser(): User
    {
        $role = Role::create(['key' => 'norights', 'name' => 'No Rights', 'is_system' => false]);

        return User::factory()->create(['role_id' => $role->id]);
    }

    /** Representative gated write endpoint per module (method + url + required permission). */
    public static function gatedWrites(): array
    {
        return [
            'create employee' => ['post', '/api/employees', 'employees.add'],
            'create contract' => ['post', '/api/contracts', 'contracts.create'],
            'create stock item' => ['post', '/api/stock-items', 'stock.manage_items'],
            'create role' => ['post', '/api/roles', 'system.manage_roles'],
            'create group role' => ['post', '/api/group-roles', 'system.manage_groups'],
            'create email template' => ['post', '/api/email-templates', 'system.configure_notifications'],
        ];
    }

    #[DataProvider('gatedWrites')]
    public function test_users_without_permission_are_forbidden(string $method, string $url): void
    {
        $user = $this->powerlessUser();
        $this->assertFalse($user->hasPermission('system.manage_roles'));

        // Empty body is fine: the permission gate runs before validation, so the
        // request is rejected with 403 rather than performing or validating it.
        $this->actingAs($user)->json($method, $url, [])->assertForbidden();
    }

    /** A super-admin (bypass) is NOT forbidden on the same endpoints โ€” proves the 403 is the gate. */
    #[DataProvider('gatedWrites')]
    public function test_super_admin_is_not_forbidden(string $method, string $url): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $super = User::factory()->create(['role' => 'super']);

        $status = $this->actingAs($super)->json($method, $url, [])->status();

        // Past the gate: may be 422 (validation) or 2xx, but never 403.
        $this->assertNotSame(403, $status, "super admin should clear the permission gate on {$url}");
    }
}
