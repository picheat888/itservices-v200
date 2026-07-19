<?php

namespace Tests\Feature;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Brand;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessSoftwareTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_software_auto_generates_a_sequential_code(): void
    {
        $a = Software::create(['name' => 'Adobe Acrobat', 'license_type' => 'subscription']);
        $b = Software::create(['name' => 'AutoCAD', 'license_type' => 'perpetual']);

        $this->assertSame('SW-0001', $a->code);
        $this->assertSame('SW-0002', $b->code);
    }

    public function test_software_casts_license_type_to_the_enum(): void
    {
        $s = Software::create(['name' => 'Chrome', 'license_type' => 'free']);

        $this->assertSame(SoftwareLicenseType::Free, $s->fresh()->license_type);
    }

    public function test_manager_can_create_software(): void
    {
        $this->actingAs($this->super());
        $brand = Brand::create(['name' => 'Adobe']);

        $this->postJson('/api/software', [
            'name' => 'Adobe Acrobat Pro',
            'brand_id' => $brand->id,
            'license_type' => 'subscription',
            'seats' => 10,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Adobe Acrobat Pro')
            ->assertJsonPath('data.license_type', 'subscription')
            ->assertJsonPath('data.seats', 10)
            ->assertJsonPath('data.seats_used', 0)
            ->assertJsonPath('data.code', fn ($c) => is_string($c) && str_starts_with($c, 'SW-'));
    }

    public function test_create_software_requires_a_valid_license_type(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'bogus'])
            ->assertStatus(422)->assertJsonValidationErrors('license_type');
    }

    public function test_reads_require_access_view(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/software')->assertForbidden();
    }

    public function test_writes_require_access_manage(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'access.view', 'allowed' => true]);
        $this->actingAs($viewer);

        // Can read...
        $this->getJson('/api/software')->assertOk();
        // ...but not write.
        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'free'])->assertForbidden();
    }

    public function test_seats_used_counts_active_members_and_over_seat_grant_is_allowed(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Photoshop', 'license_type' => 'subscription', 'seats' => 1]);
        $e1 = Employee::create(['code' => 'EMP-SW1', 'first_name' => 'A', 'last_name' => 'One']);
        $e2 = Employee::create(['code' => 'EMP-SW2', 'first_name' => 'B', 'last_name' => 'Two']);

        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e1->id])->assertCreated();
        // Over the single seat — still allowed (soft, not blocked).
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e2->id])->assertCreated();

        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.seats_used', 2);
    }

    public function test_revoking_a_member_decrements_seats_used(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Slack', 'license_type' => 'free']);
        $e = Employee::create(['code' => 'EMP-SW3', 'first_name' => 'C', 'last_name' => 'Three']);
        $res = $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated()->json('data.id');

        $this->postJson("/api/software/{$sw->id}/members/{$res}/revoke")->assertOk();
        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.seats_used', 0);
    }

    public function test_notes_are_returned_and_preserved_across_an_update(): void
    {
        $this->actingAs($this->super());

        $created = $this->postJson('/api/software', [
            'name' => 'Notion',
            'license_type' => 'subscription',
            'seats' => 5,
            'notes' => 'keep me',
        ])->assertCreated()->json('data');

        // Notes must round-trip on the list endpoint (not silently dropped by the resource).
        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.notes', 'keep me');

        // Updating another field while resending the same notes must not wipe them out.
        $this->putJson("/api/software/{$created['id']}", [
            'name' => 'Notion',
            'license_type' => 'subscription',
            'seats' => 8,
            'notes' => 'keep me',
        ])->assertOk()
            ->assertJsonPath('data.seats', 8)
            ->assertJsonPath('data.notes', 'keep me');
    }

    public function test_employee_access_endpoint_includes_software(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Jira', 'license_type' => 'subscription']);
        $e = Employee::create(['code' => 'EMP-SW9', 'first_name' => 'D', 'last_name' => 'Four']);
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated();

        $this->getJson("/api/employees/{$e->id}/access")
            ->assertOk()
            ->assertJsonPath('data.software.0.resource_name', 'Jira')
            ->assertJsonPath('data.software.0.resource_code', fn ($c) => is_string($c) && str_starts_with($c, 'SW-'));
    }
}
