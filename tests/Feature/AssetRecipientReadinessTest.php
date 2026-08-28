<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The hand-over dialog asks who cannot confirm receipt themselves, so IT knows before it
 * picks a recipient that the asset will sit in pending acceptance with nobody able to clear it.
 *
 * Two separate causes, and the dialog words them differently: no login account at all, or an
 * account that cannot open My Assets (the only page with an Accept button).
 */
class AssetRecipientReadinessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions, ?Employee $employee = null): User
    {
        $role = Role::create(['key' => 'rr_'.uniqid(), 'name' => 'Readiness Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role_id' => $role->id, 'employee_id' => $employee?->id]);
    }

    private function employee(string $code, string $status = 'active'): Employee
    {
        return Employee::create(['code' => $code, 'first_name' => 'Re', 'last_name' => 'Cipient', 'status' => $status]);
    }

    private function readiness(): array
    {
        return $this->getJson('/api/assets/recipient-readiness')->assertOk()->json('data') ?? [];
    }

    public function test_it_names_both_reasons_and_leaves_out_whoever_can_accept(): void
    {
        $ready = $this->employee('EMP-8001');
        $noPermission = $this->employee('EMP-8002');
        $noAccount = $this->employee('EMP-8003');
        $this->userWith(['assets.my'], $ready);
        $this->userWith(['tickets.view'], $noPermission);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $readiness = $this->readiness();

        $this->assertArrayNotHasKey($ready->id, $readiness);
        $this->assertSame('no_permission', $readiness[$noPermission->id]);
        $this->assertSame('no_account', $readiness[$noAccount->id]);
    }

    public function test_resigned_staff_are_left_out_because_they_are_not_offered_as_recipients(): void
    {
        $leaver = $this->employee('EMP-8004', 'resigned');

        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->assertArrayNotHasKey($leaver->id, $this->readiness());
    }

    public function test_only_somebody_who_can_hand_an_asset_over_may_ask(): void
    {
        $this->employee('EMP-8005');

        // Reading the list is part of picking a recipient, so it rides the transfer gate.
        $this->actingAs($this->userWith(['assets.view']));
        $this->getJson('/api/assets/recipient-readiness')->assertForbidden();

        $this->actingAs($this->userWith(['assets.transfer']));
        $this->getJson('/api/assets/recipient-readiness')->assertOk();
    }
}
