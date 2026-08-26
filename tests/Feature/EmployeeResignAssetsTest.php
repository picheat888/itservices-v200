<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Notifications\AssetReturnRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Recording a resignation recalls the leaver's devices: everything still in their hands
 * turns Pending return and whoever can receive assets is belled to collect it.
 *
 * Covers the gating trap too — the person recording the resignation holds employees.resign
 * and nothing from the Assets module, so the recall must not be permission-checked.
 */
class EmployeeResignAssetsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'res_'.uniqid(), 'name' => 'Resign Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function leaver(string $code = 'EMP-9001'): Employee
    {
        return Employee::create(['code' => $code, 'first_name' => 'Lea', 'last_name' => 'Ver']);
    }

    public function test_resigning_flags_every_asset_the_leaver_still_holds(): void
    {
        $employee = $this->leaver();
        $deployed = Asset::factory()->create([
            'status' => 'deployed', 'owner' => $employee->code, 'owner_employee_id' => $employee->id,
        ]);
        $awaiting = Asset::factory()->create([
            'status' => 'pending_acceptance', 'owner' => $employee->code, 'owner_employee_id' => $employee->id,
        ]);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/resign", [
            'reason' => 'Moving on', 'last_day' => '2026-09-30',
        ])->assertOk();

        $this->assertSame('pending_return', $deployed->fresh()->status->value);
        $this->assertSame('pending_return', $awaiting->fresh()->status->value);
        // The reason names the resignation so the Assets list says why it is being recalled.
        $this->assertSame("Resignation — {$employee->code}", $deployed->fresh()->last_reason);
    }

    public function test_resigning_leaves_other_peoples_and_pooled_assets_alone(): void
    {
        $employee = $this->leaver();
        $colleague = $this->leaver('EMP-9002');

        $theirs = Asset::factory()->create([
            'status' => 'deployed', 'owner' => $colleague->code, 'owner_employee_id' => $colleague->id,
        ]);
        $inPool = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        // Already on its way back — re-flagging would ring IT's bell about it a second time.
        $alreadyReturning = Asset::factory()->create([
            'status' => 'pending_return', 'owner' => $employee->code, 'owner_employee_id' => $employee->id,
            'last_reason' => 'Swapping the keyboard',
        ]);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();

        $this->assertSame('deployed', $theirs->fresh()->status->value);
        $this->assertSame('ready', $inPool->fresh()->status->value);
        $this->assertSame('Swapping the keyboard', $alreadyReturning->fresh()->last_reason);
    }

    public function test_it_is_belled_once_per_recalled_asset(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        Asset::factory()->count(3)->create([
            'status' => 'deployed', 'owner' => $employee->code, 'owner_employee_id' => $employee->id,
        ]);

        $receiver = $this->userWith(['assets.module', 'assets.receive']);
        $bystander = $this->userWith(['employees.module', 'employees.view']);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();

        Notification::assertSentToTimes($receiver, AssetReturnRequestedNotification::class, 3);
        Notification::assertNotSentTo($bystander, AssetReturnRequestedNotification::class);
    }

    public function test_recall_does_not_require_an_assets_permission(): void
    {
        $employee = $this->leaver();
        $asset = Asset::factory()->create([
            'status' => 'deployed', 'owner' => $employee->code, 'owner_employee_id' => $employee->id,
        ]);

        // HR-shaped account: can record a resignation, holds nothing from the Assets module.
        $this->actingAs($this->userWith(['employees.module', 'employees.view', 'employees.resign']));
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();

        $this->assertSame('pending_return', $asset->fresh()->status->value);
    }

    public function test_resigning_an_employee_holding_nothing_still_succeeds(): void
    {
        $employee = $this->leaver();

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resigned');
    }
}
