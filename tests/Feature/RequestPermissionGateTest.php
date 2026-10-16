<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Covers the requests.module master key: grantable, gating the tree, and applied when a role is saved.
class RequestPermissionGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_master_is_a_real_grantable_key(): void
    {
        $this->assertContains('requests.module', Permissions::all());
        $this->assertSame('requests.module', Permissions::requestHierarchy()['master']);
    }

    public function test_without_the_master_every_request_key_is_dropped(): void
    {
        $normalized = Permissions::normalizeRequests(['requests.submit', 'requests.complete', 'tickets.create']);

        // The module key is what opens the screen; a capability inside a screen nobody can
        // reach is not a grant, it is a loose end.
        $this->assertSame(['tickets.create'], $normalized);
    }

    public function test_hearing_about_the_queue_does_not_require_working_it(): void
    {
        $granted = ['requests.module', 'requests.notify_approved', 'requests.notify_stalled'];

        // A manager can follow the completion queue without being the one who closes
        // anything — which is why RequestNotificationService gates the mail on
        // notify_approved rather than on complete. The card must not invent that link.
        $this->assertEqualsCanonicalizing($granted, Permissions::normalizeRequests($granted));
    }

    public function test_normalizing_a_grant_with_no_type_keys_leaves_it_unchanged(): void
    {
        $full = ['requests.module', 'requests.submit', 'requests.view_all', 'requests.complete',
            'requests.notify_approved', 'requests.notify_stalled'];

        $this->assertEqualsCanonicalizing($full, Permissions::normalizeRequests($full));
    }

    public function test_saving_a_role_applies_the_tree(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $role = Role::create(['key' => 'req_test', 'name' => 'Request Test', 'is_system' => false]);

        // A request key switched on with no master behind it: the screen it lives on would
        // be unreachable, so the grant is dropped on save rather than stored as a loose end.
        $this->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['requests.notify_stalled', 'requests.complete'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();

        $this->assertNotContains('requests.notify_stalled', $stored);
        $this->assertNotContains('requests.complete', $stored);
    }

    public function test_the_master_alone_carries_the_notification_keys(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $role = Role::create(['key' => 'req_watch', 'name' => 'Queue Watcher', 'is_system' => false]);

        // The shape this card has to allow: someone who follows the queue but never works it.
        $this->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['requests.module', 'requests.notify_approved'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();

        $this->assertContains('requests.notify_approved', $stored);
        $this->assertNotContains('requests.complete', $stored);
    }

    public function test_the_menu_and_the_route_open_on_the_master_alone(): void
    {
        foreach (['resources/js/app/nav.ts', 'resources/js/app/App.tsx'] as $path) {
            $source = (string) file_get_contents(base_path($path));
            $line = collect(explode("\n", $source))
                ->first(fn (string $l) => str_contains($l, 'anyOf') && str_contains($l, "'requests.module'"));

            $this->assertNotNull($line, "{$path} no longer gates Requests on requests.module");
            $this->assertStringContainsString("['requests.module']", $line, "{$path} gates Requests on more than the master");
        }
    }
}
