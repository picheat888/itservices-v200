<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_changes_helper_builds_field_diff_and_hides_noise(): void
    {
        $role = Role::create(['key' => 'editor', 'name' => 'Editor', 'color' => '#111111', 'is_system' => false]);

        $before = $role->getOriginal();
        $role->update(['name' => 'Senior Editor', 'color' => '#222222']);

        $details = AuditLog::changes($before, $role);

        $this->assertNotNull($details);
        $this->assertSame('Editor', $details['changes']['name']['from']);
        $this->assertSame('Senior Editor', $details['changes']['name']['to']);
        $this->assertSame('#111111', $details['changes']['color']['from']);
        $this->assertArrayNotHasKey('updated_at', $details['changes']); // noise hidden
    }

    public function test_changes_helper_returns_null_when_nothing_changed(): void
    {
        $role = Role::create(['key' => 'viewer', 'name' => 'Viewer', 'color' => '#333333', 'is_system' => false]);

        $before = $role->getOriginal();
        $role->update(['name' => 'Viewer']); // same value → no real change

        $this->assertNull(AuditLog::changes($before, $role));
    }

    public function test_audit_index_filters_by_search_category_and_returns_users(): void
    {
        $super = User::factory()->create(['role' => 'super', 'name' => 'Boss']);
        $this->actingAs($super);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Created brand', 'target' => 'Acme']);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Updated brand', 'target' => 'Acme']);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Deleted vendor', 'target' => 'Other']);

        // Category filter: only "created" verbs.
        $this->getJson('/api/audit-logs?category=created')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'Created brand');

        // Free-text search on target.
        $this->getJson('/api/audit-logs?q=Other')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'Deleted vendor');

        // Distinct actors exposed for the filter dropdown.
        $this->getJson('/api/audit-logs')
            ->assertOk()
            ->assertJsonPath('meta.users.0', 'Boss');
    }

    public function test_role_update_endpoint_records_audit_details(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $role = Role::create(['key' => 'editor', 'name' => 'Editor', 'color' => '#111111', 'is_system' => false]);

        $this->actingAs($super)
            ->putJson("/api/roles/{$role->key}", ['name' => 'Lead Editor', 'color' => '#111111'])
            ->assertOk();

        $log = AuditLog::where('action', 'Updated role')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('Editor', $log->details['changes']['name']['from']);
        $this->assertSame('Lead Editor', $log->details['changes']['name']['to']);
    }
}
