<?php

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The self-service access list — the profile drawer's Access tab.
 *
 * A linked employee sees their own grants with no permission at all; the Access Directory's
 * master is the right to browse everybody's, which a plain employee never needs.
 */
class MyAccessTest extends TestCase
{
    use RefreshDatabase;

    private function staff(array $permissions = [], string $name = 'Somchai'): User
    {
        $employee = Employee::create(['first_name' => $name, 'status' => 'active']);
        $user = User::factory()->create(['employee_id' => $employee->id]);
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => $key], ['allowed' => true]);
        }

        return $user->refresh();
    }

    public function test_it_lists_only_the_readers_own_grants(): void
    {
        $me = $this->staff();
        $someoneElse = $this->staff([], 'Manee');

        $share = FileShare::create(['name' => 'Finance', 'path' => '\\\\NAS\\Finance']);
        $software = Software::create(['name' => 'AutoCAD LT']);

        AccessMembership::create([
            'resource_type' => 'file_share', 'resource_id' => $share->id,
            'employee_id' => $me->employee_id, 'access_level' => 'Read', 'granted_at' => now(),
        ]);
        AccessMembership::create([
            'resource_type' => 'software', 'resource_id' => $software->id,
            'employee_id' => $someoneElse->employee_id, 'granted_at' => now(),
        ]);

        $body = $this->actingAs($me)->getJson('/api/access/mine')->assertOk()->json('data');

        $this->assertCount(1, $body['file_shares']);
        $this->assertSame('Finance', $body['file_shares'][0]['resource_name']);
        $this->assertSame('Read', $body['file_shares'][0]['access_level']);
        // Somebody else's software grant is not mine to see here.
        $this->assertSame([], $body['software']);
    }

    /** A revoked grant is not access any more, however recently it was withdrawn. */
    public function test_a_revoked_grant_does_not_show(): void
    {
        $me = $this->staff();
        $share = FileShare::create(['name' => 'Old share', 'path' => '\\\\NAS\\Old']);
        AccessMembership::create([
            'resource_type' => 'file_share', 'resource_id' => $share->id,
            'employee_id' => $me->employee_id, 'granted_at' => now()->subMonth(), 'revoked_at' => now(),
        ]);

        $this->actingAs($me)->getJson('/api/access/mine')->assertOk()->assertJsonCount(0, 'data.file_shares');
    }

    /** A linked employee with no permissions at all still sees their own access. */
    public function test_a_linked_employee_needs_no_permission(): void
    {
        $me = $this->staff();

        $this->assertSame([], $me->permissions());
        $this->actingAs($me)->getJson('/api/access/mine')->assertOk();
    }

    /** With the master off, normalisation keeps no access.* key at all. */
    public function test_no_access_key_survives_the_master_being_off(): void
    {
        $kept = Permissions::normalizeAccess(['access.email_view', 'access.overview']);

        $this->assertSame([], array_values($kept));
        $this->assertNotContains('access.my', Permissions::all());
    }

    /** An account with no employee record still gets a page, with every list empty. */
    public function test_an_account_with_no_employee_record_gets_an_empty_list(): void
    {
        $user = User::factory()->create(['employee_id' => null]);

        $this->actingAs($user)->getJson('/api/access/mine')->assertOk()
            ->assertJsonCount(0, 'data.software')
            ->assertJsonCount(0, 'data.file_shares')
            ->assertJsonCount(0, 'data.email_groups')
            ->assertJsonCount(0, 'data.social');
    }

    public function test_it_needs_a_signed_in_account(): void
    {
        $this->getJson('/api/access/mine')->assertUnauthorized();
    }
}
