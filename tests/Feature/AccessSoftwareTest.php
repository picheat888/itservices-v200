<?php

namespace Tests\Feature;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\AuditLog;
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

    public function test_create_software_requires_seats_unless_marked_unlimited(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'subscription'])
            ->assertStatus(422)->assertJsonValidationErrors('seats');
        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'subscription', 'seats' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('seats');
        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'subscription', 'seats' => 0])
            ->assertStatus(422)->assertJsonValidationErrors('seats');
    }

    public function test_unlimited_software_is_stored_without_a_seat_count(): void
    {
        $this->actingAs($this->super());

        $id = $this->postJson('/api/software', [
            'name' => 'VS Code',
            'license_type' => 'open_source',
            'seats' => 5,
            'seats_unlimited' => true,
        ])->assertCreated()
            ->assertJsonPath('data.seats', null)
            ->assertJsonMissingPath('data.seats_unlimited')
            ->json('data.id');

        $this->assertNull(Software::find($id)->seats);
    }

    public function test_marking_existing_software_unlimited_clears_its_seat_count(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Office', 'license_type' => 'subscription', 'seats' => 20]);

        $this->putJson("/api/software/{$sw->id}", [
            'name' => 'Office',
            'license_type' => 'subscription',
            'seats_unlimited' => '1',
        ])->assertOk()->assertJsonPath('data.seats', null);

        $this->putJson("/api/software/{$sw->id}", [
            'name' => 'Office',
            'license_type' => 'subscription',
            'seats' => 30,
            'seats_unlimited' => '0',
        ])->assertOk()->assertJsonPath('data.seats', 30);
    }

    public function test_reads_require_access_view(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/software')->assertForbidden();
    }

    public function test_writes_require_the_granular_action_key(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'access.module', 'allowed' => true]);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'access.software_view', 'allowed' => true]);
        $this->actingAs($viewer);

        // Can read...
        $this->getJson('/api/software')->assertOk();
        // ...but not write.
        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'free'])->assertForbidden();
    }

    public function test_seats_used_counts_active_members_and_a_full_software_rejects_more(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Photoshop', 'license_type' => 'subscription', 'seats' => 1]);
        $e1 = Employee::create(['code' => 'EMP-SW1', 'first_name' => 'A', 'last_name' => 'One']);
        $e2 = Employee::create(['code' => 'EMP-SW2', 'first_name' => 'B', 'last_name' => 'Two']);

        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e1->id])->assertCreated();
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e2->id])
            ->assertStatus(422)->assertJsonValidationErrors('employee_id')->assertJsonPath('message', 'seats_full');

        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.seats_used', 1);
    }

    public function test_a_membership_cannot_be_revoked_through_another_resource(): void
    {
        $this->actingAs($this->super());
        $office = Software::create(['name' => 'Office', 'license_type' => 'subscription', 'seats' => 5]);
        $chrome = Software::create(['name' => 'Chrome', 'license_type' => 'free']);
        $e = Employee::create(['code' => 'EMP-SWI1', 'first_name' => 'I', 'last_name' => 'Dor']);
        $grant = $this->postJson("/api/software/{$office->id}/members", ['employee_id' => $e->id])->assertCreated()->json('data.id');

        $this->postJson("/api/software/{$chrome->id}/members/{$grant}/revoke")->assertNotFound();
        $this->assertNull(AccessMembership::find($grant)->revoked_at);
    }

    public function test_the_audit_log_never_stores_the_product_key(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Office', 'license_type' => 'subscription', 'seats' => 5, 'product_key' => 'OLD-SECRET-KEY']);

        $this->putJson("/api/software/{$sw->id}", ['name' => 'Office', 'license_type' => 'subscription', 'seats' => 5, 'product_key' => 'NEW-SECRET-KEY'])
            ->assertOk();

        $details = AuditLog::where('action', 'Updated software')->latest('id')->value('details');
        $this->assertStringNotContainsString('SECRET', (string) json_encode($details));
        $this->assertSame(['from' => '••••', 'to' => '••••'], $details['changes']['product_key']);
    }

    public function test_a_revoked_seat_can_be_granted_again_and_unlimited_never_fills(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Visio', 'license_type' => 'subscription', 'seats' => 1]);
        $free = Software::create(['name' => 'Chrome', 'license_type' => 'free']);
        $e1 = Employee::create(['code' => 'EMP-SWR1', 'first_name' => 'R', 'last_name' => 'One']);
        $e2 = Employee::create(['code' => 'EMP-SWR2', 'first_name' => 'R', 'last_name' => 'Two']);

        $first = $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e1->id])->assertCreated()->json('data.id');
        $this->postJson("/api/software/{$sw->id}/members/{$first}/revoke")->assertOk();
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e2->id])->assertCreated();

        $this->postJson("/api/software/{$free->id}/members", ['employee_id' => $e1->id])->assertCreated();
        $this->postJson("/api/software/{$free->id}/members", ['employee_id' => $e2->id])->assertCreated();
    }

    public function test_editing_cannot_lower_seats_below_the_licences_in_use(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 10]);
        foreach (range(1, 5) as $i) {
            $e = Employee::create(['code' => "EMP-SWS{$i}", 'first_name' => 'S', 'last_name' => "N{$i}"]);
            $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated();
        }
        $payload = ['name' => 'AutoCAD', 'license_type' => 'subscription'];

        $this->putJson("/api/software/{$sw->id}", [...$payload, 'seats' => 4])
            ->assertStatus(422)->assertJsonValidationErrors('seats')->assertJsonPath('message', 'seats_below_in_use')->assertJsonPath('in_use', 5);
        $this->assertSame(10, $sw->fresh()->seats);

        $this->putJson("/api/software/{$sw->id}", [...$payload, 'seats' => 5])
            ->assertOk()->assertJsonPath('data.seats', 5);
    }

    public function test_over_granted_software_can_be_edited_without_changing_its_seats(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Photoshop', 'license_type' => 'subscription', 'seats' => 1]);
        foreach (range(1, 2) as $i) {
            $e = Employee::create(['code' => "EMP-SWO{$i}", 'first_name' => 'O', 'last_name' => "N{$i}"]);
            $sw->memberships()->create(['employee_id' => $e->id, 'granted_at' => now()]);
        }

        $this->putJson("/api/software/{$sw->id}", ['name' => 'Photoshop CC', 'license_type' => 'subscription', 'seats' => 1])
            ->assertOk()->assertJsonPath('data.name', 'Photoshop CC');
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

    public function test_employee_access_rows_expose_the_software_logo(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Figma', 'license_type' => 'subscription', 'logo_path' => 'software-logos/figma.png']);
        $bare = Software::create(['name' => 'Slack', 'license_type' => 'subscription']);
        $e = Employee::create(['code' => 'EMP-SW10', 'first_name' => 'E', 'last_name' => 'Five']);
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated();
        $this->postJson("/api/software/{$bare->id}/members", ['employee_id' => $e->id])->assertCreated();

        $rows = $this->getJson("/api/employees/{$e->id}/access")->assertOk()->json('data.software');
        $byName = collect($rows)->keyBy('resource_name');
        $this->assertIsString($byName['Figma']['resource_logo']);
        $this->assertNull($byName['Slack']['resource_logo']);
    }
}
