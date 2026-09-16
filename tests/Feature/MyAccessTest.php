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
 * The self-service access list — the lower half of "My assets & access".
 *
 * Employees had no way at all to see which systems they can reach; this is that answer, and
 * it answers to its own right (`access.my`) rather than to the Access Directory's master,
 * which is the right to browse everybody's.
 */
class MyAccessTest extends TestCase
{
    use RefreshDatabase;

    private function staff(array $permissions = ['access.my'], string $name = 'Somchai'): User
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

    /**
     * The right stands on its own: the Access Directory master is the right to browse
     * everybody's access, and a plain employee has no business holding it to see their own.
     */
    public function test_it_answers_to_access_my_and_not_to_the_directory_master(): void
    {
        $withoutIt = $this->staff([]);
        $this->actingAs($withoutIt)->getJson('/api/access/mine')->assertForbidden();

        $withIt = $this->staff(['access.my'], 'Manee');
        $this->actingAs($withIt)->getJson('/api/access/mine')->assertOk();
    }

    /** Normalisation must not strip the self-service key along with the rest of access.*. */
    public function test_the_self_service_key_survives_the_master_being_off(): void
    {
        $kept = Permissions::normalizeAccess(['access.my', 'access.email_view', 'access.overview']);

        $this->assertSame(['access.my'], array_values($kept));
    }

    /**
     * An account with no employee record still gets a page. It is where somebody would look
     * to find out nothing is linked to them yet — a 500 there teaches them nothing.
     */
    public function test_an_account_with_no_employee_record_gets_an_empty_list(): void
    {
        $user = User::factory()->create(['employee_id' => null]);
        RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => 'access.my'], ['allowed' => true]);

        $this->actingAs($user->refresh())->getJson('/api/access/mine')->assertOk()
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
