<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Deleting an employee is for a mis-entry — a duplicate or a test row nothing refers to yet.
 *
 * The danger it guards is invisible: `tickets.requester_id` and the access tables cascade, so
 * a delete that slipped past a missing check would take a real person's whole ticket history
 * with it and report success. Every test here is really asking "does the guard still hold".
 */
class EmployeeDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function employee(string $code = 'EMP-DEL1'): Employee
    {
        return Employee::create(['code' => $code, 'first_name' => 'Typed', 'last_name' => 'Wrong']);
    }

    public function test_a_freshly_mistyped_employee_can_be_deleted(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee();

        $this->getJson("/api/employees/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.delete_blockers', []);

        $this->deleteJson("/api/employees/{$employee->id}")->assertOk();

        $this->assertDatabaseMissing('employees', ['id' => $employee->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'Deleted employee', 'target' => 'Typed Wrong (EMP-DEL1)']);
    }

    public function test_an_employee_with_a_ticket_is_refused_and_keeps_the_ticket(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee('EMP-DEL2');
        $ticket = Ticket::create([
            'subject' => 'Printer jam', 'description' => 'Paper stuck', 'category' => 'hardware',
            'requester_id' => $employee->id,
        ]);

        $this->deleteJson("/api/employees/{$employee->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'has_activity')
            ->assertJsonPath('blockers.0', 'tickets');

        // The point of the guard: the ticket would have cascaded away with them.
        $this->assertDatabaseHas('employees', ['id' => $employee->id]);
        $this->assertDatabaseHas('tickets', ['id' => $ticket->id]);
    }

    public function test_an_employee_who_once_held_a_device_is_refused(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee('EMP-DEL3');

        // Nothing points at them by id any more — the device went back to the pool. Their code
        // on the custody trail is the only trace, and it is the one that matters.
        AssetTransfer::create([
            'asset_id' => Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null])->id,
            'asset_tag' => 'INK-IT-001', 'asset_model' => 'Latitude 5440', 'kind' => 'return',
            'from_owner' => 'EMP-DEL3', 'to_owner' => 'Central IT', 'performed_by' => 'IT',
        ]);

        $this->deleteJson("/api/employees/{$employee->id}")
            ->assertStatus(422)
            ->assertJsonPath('blockers.0', 'asset_history');
    }

    public function test_an_employee_still_holding_an_asset_is_refused(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee('EMP-DEL4');
        Asset::factory()->create(['status' => 'deployed', 'owner' => null, 'owner_employee_id' => $employee->id]);

        $this->deleteJson("/api/employees/{$employee->id}")
            ->assertStatus(422)
            ->assertJsonPath('blockers.0', 'assets');
    }

    /**
     * The case the whole feature is for, set up the way production actually is: a default role
     * group exists, so adding anyone puts them in it immediately. If that membership counted as
     * activity, a record added a minute ago by mistake could never be deleted — and every live
     * employee read as un-deletable, which is how this was caught.
     */
    public function test_the_default_role_group_alone_does_not_block_a_delete(): void
    {
        $this->actingAs($this->super());
        $group = GroupRole::create(['name' => 'All staff']);
        AppSetting::put('default_employee_group_id', (string) $group->id);

        $this->postJson('/api/employees', ['first_name' => 'Typed', 'last_name' => 'Twice', 'joined_at' => '2026-09-15'])->assertCreated();
        $employee = Employee::where('first_name', 'Typed')->firstOrFail();
        $this->assertTrue($employee->groupRoles()->exists(), 'the fixture must mirror production: new hires land in the default group');

        $this->deleteJson("/api/employees/{$employee->id}")->assertOk();

        $this->assertDatabaseMissing('employees', ['id' => $employee->id]);
        $this->assertDatabaseMissing('group_role_employee', ['employee_id' => $employee->id]);
    }

    public function test_a_resigned_employee_is_refused(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee('EMP-DEL5');
        $employee->update(['status' => 'resigned']);

        // A leaver is history, not a mistake — there is nothing to undo here.
        $this->deleteJson("/api/employees/{$employee->id}")
            ->assertStatus(422)
            ->assertJsonPath('blockers.0', 'resigned');
    }

    public function test_a_manager_of_someone_is_refused(): void
    {
        $this->actingAs($this->super());
        $manager = $this->employee('EMP-DEL6');
        Employee::create(['code' => 'EMP-DEL7', 'first_name' => 'Reports', 'last_name' => 'ToThem', 'manager_id' => $manager->id]);

        $this->deleteJson("/api/employees/{$manager->id}")
            ->assertStatus(422)
            ->assertJsonPath('blockers.0', 'subordinates');
    }

    public function test_an_unused_login_account_is_deleted_with_the_employee(): void
    {
        $this->actingAs($this->super());
        $employee = $this->employee('EMP-DEL8');
        $account = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id, 'username' => 'typed_wrong']);

        $this->deleteJson("/api/employees/{$employee->id}")->assertOk();

        // After the delete nothing else can say which login disappeared, so the audit entry does.
        $entry = AuditLog::where('action', 'Deleted employee')->latest('id')->firstOrFail();
        $this->assertSame('typed_wrong', $entry->details['facts']['login_account']);

        // Keeping it would leave a sign-in that still works but appears nowhere in the module:
        // users.employee_id is nullOnDelete, and nothing else in the system deletes an account.
        $this->assertDatabaseMissing('employees', ['id' => $employee->id]);
        $this->assertDatabaseMissing('users', ['id' => $account->id]);
    }

    public function test_an_account_that_has_done_something_blocks_the_delete(): void
    {
        $actor = $this->super();
        $employee = $this->employee('EMP-DEL9');
        $account = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);

        // They signed in and changed something once — that is history, however small.
        $this->actingAs($account);
        AuditLog::record('Updated own profile', 'self');

        $this->actingAs($actor)
            ->deleteJson("/api/employees/{$employee->id}")
            ->assertStatus(422)
            ->assertJsonPath('blockers.0', 'account_used');

        $this->assertDatabaseHas('users', ['id' => $account->id]);
    }

    public function test_deleting_needs_its_own_permission(): void
    {
        $employee = $this->employee('EMP-DELA');

        // Full edit rights over employees are not permission to erase one.
        $editor = User::factory()->create(['role' => 'user']);
        foreach (['employees.view', 'employees.edit', 'employees.resign'] as $permission) {
            RolePermission::create(['role_id' => $editor->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        $this->actingAs($editor)->deleteJson("/api/employees/{$employee->id}")->assertForbidden();
        $this->assertDatabaseHas('employees', ['id' => $employee->id]);

        RolePermission::create(['role_id' => $editor->role_id, 'permission' => 'employees.delete', 'allowed' => true]);
        $this->actingAs($editor)->deleteJson("/api/employees/{$employee->id}")->assertOk();
    }
}
