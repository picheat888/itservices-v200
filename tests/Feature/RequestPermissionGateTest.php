<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Requests was the last workspace module without a master key. Its permission card fell
 * through to the page's plain fallback — a flat list of five switches — because there was
 * no master to hang a tree off, and there was no single switch that handed somebody the
 * module: the page was gated on "holds any of submit / view_all / complete".
 *
 * The master exists now. What matters is that it behaves like every other module's, and
 * that roles granted before it existed keep the access they already had.
 */
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

    public function test_the_tree_survives_a_full_grant_untouched(): void
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

    public function test_a_role_granted_before_the_master_existed_keeps_the_menu(): void
    {
        // nav.ts and App.tsx both accept the master OR the older keys, because normalisation
        // only forces the master when permissions are SAVED — rows written before it existed
        // still hold submit on its own, and must not lose the module.
        foreach (['resources/js/app/nav.ts', 'resources/js/app/App.tsx'] as $path) {
            $source = file_get_contents(base_path($path));
            $line = collect(explode("\n", $source))
                ->first(fn (string $l) => str_contains($l, 'requests.submit'));

            $this->assertNotNull($line, "{$path} no longer gates Requests on requests.submit");
            $this->assertStringContainsString('requests.module', $line, "{$path} gates Requests without accepting the master");
        }
    }
}
