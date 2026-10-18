<?php

// Role Templates save: the per-role version token (stale save = 409) and the "Updated permissions" audit row.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolePermissionVersionTest extends TestCase
{
    use RefreshDatabase;

    private Role $role;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator', 'is_system' => true]);
        $this->role = Role::create(['key' => 'clerk', 'name' => 'Clerk', 'is_system' => false]);
        RolePermission::create(['role_id' => $this->role->id, 'permission' => 'tickets.module', 'allowed' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
    }

    private function matrixVersion(): string
    {
        return collect($this->getJson('/api/permissions')->assertOk()->json('data.roles'))
            ->firstWhere('value', 'clerk')['version'];
    }

    /** @return list<string> */
    private function storedKeys(): array
    {
        $keys = $this->role->allowedKeys();
        sort($keys);

        return $keys;
    }

    public function test_the_matrix_sends_a_version_that_changes_with_the_stored_set(): void
    {
        $version = $this->matrixVersion();
        $this->assertSame($this->role->permissionsVersion(), $version);

        RolePermission::create(['role_id' => $this->role->id, 'permission' => 'tickets.create', 'allowed' => true]);

        $this->assertNotSame($version, $this->matrixVersion());
    }

    public function test_a_fresh_save_writes_and_answers_with_the_new_version(): void
    {
        $version = $this->matrixVersion();

        $response = $this->putJson('/api/permissions/clerk', ['permissions' => ['tickets.module', 'tickets.create'], 'version' => $version])
            ->assertOk();

        $this->assertSame(['tickets.create', 'tickets.module'], $this->storedKeys());
        $saved = collect($response->json('data.roles'))->firstWhere('value', 'clerk');
        $this->assertSame($this->role->permissionsVersion(), $saved['version']);
        $this->assertNotSame($version, $saved['version']);
    }

    public function test_a_stale_save_is_refused_and_writes_nothing(): void
    {
        $stale = $this->matrixVersion();
        // Another admin saves first
        $this->putJson('/api/permissions/clerk', ['permissions' => ['tickets.module', 'tickets.create'], 'version' => $stale])->assertOk();
        $auditRows = AuditLog::count();

        $this->putJson('/api/permissions/clerk', ['permissions' => ['assets.module'], 'version' => $stale])
            ->assertStatus(409)
            ->assertJsonPath('code', 'role_changed');

        $this->assertSame(['tickets.create', 'tickets.module'], $this->storedKeys());
        $this->assertSame($auditRows, AuditLog::count());
    }

    public function test_a_save_without_a_version_is_refused(): void
    {
        $this->putJson('/api/permissions/clerk', ['permissions' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('version');

        $this->assertSame(['tickets.module'], $this->storedKeys());
    }

    public function test_the_audit_row_names_the_role_as_its_subject(): void
    {
        $this->putJson('/api/permissions/clerk', ['permissions' => ['tickets.create'], 'version' => $this->matrixVersion()])->assertOk();

        $entry = AuditLog::forSubject($this->role)->where('action', 'Updated permissions')->sole();
        $this->assertSame(['tickets.create'], $entry->details['added']);
        $this->assertSame(['tickets.module'], $entry->details['removed']);
    }

    public function test_a_save_that_changes_nothing_writes_no_audit_row(): void
    {
        $this->putJson('/api/permissions/clerk', ['permissions' => ['tickets.module'], 'version' => $this->matrixVersion()])->assertOk();

        $this->assertSame(0, AuditLog::where('action', 'Updated permissions')->count());
    }
}
