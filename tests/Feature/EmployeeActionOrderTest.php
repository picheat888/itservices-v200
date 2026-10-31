<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Employee actions refuse rights first, then the record, then the fields, with the same codes (EMP-20). */
class EmployeeActionOrderTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string ...$permissions): User
    {
        $role = Role::create(['key' => 'r_'.uniqid(), 'name' => 'Role '.uniqid(), 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function employee(array $attributes = []): Employee
    {
        return Employee::create(['first_name' => 'Target', 'last_name' => 'Person', 'status' => 'active', ...$attributes]);
    }

    private function linkedTo(User $account, array $attributes = []): Employee
    {
        $employee = $this->employee($attributes);
        $account->update(['employee_id' => $employee->id]);

        return $employee;
    }

    public function test_an_administrator_record_is_refused_to_a_non_administrator_before_its_fields(): void
    {
        $admin = $this->linkedTo(User::factory()->create(['role' => 'super']));

        $this->actingAs($this->userWith('employees.edit'))
            ->putJson("/api/employees/{$admin->id}", [])
            ->assertForbidden()
            ->assertJsonPath('message', 'Only an Administrator can edit an Administrator account.');
    }

    public function test_no_right_is_a_403_before_anything_else(): void
    {
        $this->actingAs($this->userWith('employees.view'));
        $resigned = $this->employee(['status' => 'resigned']);

        $this->postJson("/api/employees/{$resigned->id}/resign", ['last_day' => 'x'])->assertForbidden();
        $this->postJson("/api/employees/{$resigned->id}/credentials", [])->assertForbidden();
        $this->postJson("/api/employees/{$resigned->id}/cancel-resign")->assertForbidden();
        $this->deleteJson("/api/employees/{$resigned->id}")->assertForbidden();
        $this->putJson("/api/employees/{$resigned->id}", [])->assertForbidden();
        $this->getJson('/api/employees/summary')->assertForbidden();
        $this->getJson('/api/employees/org-chart')->assertForbidden();
        $this->getJson('/api/employees/onboarding-services')->assertForbidden();
        $this->postJson('/api/employees/import/preview', [])->assertForbidden();
    }

    public function test_a_resignation_names_the_record_before_the_fields(): void
    {
        $hr = $this->userWith('employees.resign');
        $own = $this->linkedTo($hr);
        $resigned = $this->employee(['status' => 'resigned']);
        $admin = $this->linkedTo(User::factory()->create(['role' => 'super']));

        $this->actingAs($hr)
            ->postJson("/api/employees/{$own->id}/resign", ['last_day' => 'x'])
            ->assertForbidden()
            ->assertExactJson(['message' => 'own_account', 'code' => 'own_account_resign']);
        $this->postJson("/api/employees/{$admin->id}/resign", ['last_day' => 'x'])
            ->assertForbidden()
            ->assertJsonPath('message', 'super_account');
        $this->postJson("/api/employees/{$resigned->id}/resign", ['last_day' => 'x'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'already_resigned')
            ->assertJsonMissingPath('errors');

        // The only working Administrator, resigned by an account no employee holds
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson("/api/employees/{$admin->id}/resign", ['last_day' => 'x'])
            ->assertStatus(422)
            ->assertExactJson(['message' => 'last_super_admin', 'code' => 'last_super_admin']);
    }

    public function test_a_resignation_with_a_last_day_before_the_start_is_a_field_error(): void
    {
        $employee = $this->employee(['joined_at' => '2026-05-01']);

        $this->actingAs($this->userWith('employees.resign'))
            ->postJson("/api/employees/{$employee->id}/resign", ['last_day' => '2026-04-30'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('last_day');
    }

    public function test_a_new_login_names_the_record_before_the_fields(): void
    {
        $this->actingAs($this->userWith('employees.set_credentials'));
        $withLogin = $this->linkedTo(User::factory()->create());
        $admin = $this->employee();
        // An Administrator-group employee: their first login would be super
        $admin->update(['username' => 'boss']);
        User::factory()->create(['role' => 'super', 'username' => 'boss']);

        $this->postJson("/api/employees/{$withLogin->id}/credentials", [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Employee already has a login account.');
        $this->postJson("/api/employees/{$admin->id}/credentials", [])
            ->assertForbidden()
            ->assertJsonPath('message', 'super_account');
    }

    public function test_a_login_change_names_the_record_then_checks_both_rights_before_writing(): void
    {
        $noLogin = $this->employee();
        $account = User::factory()->create(['username' => 'before']);
        $employee = $this->linkedTo($account);

        $this->actingAs($this->userWith('employees.set_credentials'))
            ->putJson("/api/employees/{$noLogin->id}/credentials", ['username' => '!'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'no_account');
        $this->putJson("/api/employees/{$employee->id}/credentials", [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Nothing to update.');
        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'after', 'reset_password' => true])
            ->assertForbidden();

        $this->assertSame('before', $account->fresh()->username);
    }

    public function test_a_login_change_saves_the_username_in_lower_case(): void
    {
        $account = User::factory()->create(['username' => 'before']);
        $employee = $this->linkedTo($account);

        $this->actingAs($this->userWith('employees.set_credentials'))
            ->putJson("/api/employees/{$employee->id}/credentials", ['username' => '  New.Name '])
            ->assertOk();

        $this->assertSame('new.name', $account->fresh()->username);
        $this->assertSame('new.name', $employee->fresh()->username);
    }

    public function test_a_password_reset_without_a_password_hands_back_one_that_meets_the_policy(): void
    {
        $account = User::factory()->create();
        $employee = $this->linkedTo($account);

        $password = $this->actingAs($this->userWith('employees.reset_password'))
            ->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'force_change' => true])
            ->assertOk()
            ->json('new_password');

        $this->assertMatchesRegularExpression('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{14}$/', $password);
        $this->assertTrue($account->fresh()->must_change_password);
        $this->assertNull($account->fresh()->password_changed_at);
    }

    public function test_cancelling_the_resignation_of_a_working_employee_is_a_422(): void
    {
        $this->actingAs($this->userWith('employees.cancel_resign'))
            ->postJson("/api/employees/{$this->employee()->id}/cancel-resign")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Employee is not resigned.');
    }
}
