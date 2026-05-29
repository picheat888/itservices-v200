<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeAccountLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_and_user_resolve_each_other_through_the_fk(): void
    {
        $employee = Employee::create(['code' => 'EMP-9001', 'name' => 'Test Person', 'email' => 'tp@x.test']);
        $user = User::factory()->create(['employee_id' => $employee->id]);

        $this->assertSame($user->id, $employee->fresh()->user->id);
        $this->assertSame($employee->id, $user->fresh()->employee->id);
    }

    public function test_setting_credentials_links_the_account_via_fk(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['code' => 'EMP-9002', 'name' => 'New Hire', 'email' => 'nh@x.test']);

        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'newhire',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertCreated();

        $user = User::where('username', 'newhire')->first();
        $this->assertNotNull($user);
        $this->assertSame($employee->id, $user->employee_id);
        $this->assertTrue($employee->fresh()->user()->exists());
    }

    public function test_reset_password_uses_fk_link(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $linked = Employee::create(['code' => 'EMP-9003', 'name' => 'Linked', 'email' => 'l@x.test']);
        User::factory()->create(['employee_id' => $linked->id]);
        $unlinked = Employee::create(['code' => 'EMP-9004', 'name' => 'Unlinked', 'email' => 'u@x.test']);

        $this->postJson("/api/employees/{$linked->id}/reset-password")
            ->assertOk()->assertJsonPath('new_password', 'EMP-9003');

        $this->postJson("/api/employees/{$unlinked->id}/reset-password")
            ->assertStatus(422)->assertJsonPath('message', 'no_account');
    }

    public function test_has_account_flag_reflects_fk(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $linked = Employee::create(['code' => 'EMP-9005', 'name' => 'HasAcct', 'email' => 'h@x.test']);
        User::factory()->create(['employee_id' => $linked->id]);

        $this->getJson("/api/employees/{$linked->id}")
            ->assertOk()->assertJsonPath('data.has_account', true);
    }

    public function test_credentials_rejected_when_already_linked(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['code' => 'EMP-9006', 'name' => 'Dup', 'email' => 'd@x.test']);
        User::factory()->create(['employee_id' => $employee->id]);

        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'dupuser', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_index_filters_by_account_via_fk(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $withAcct = Employee::create(['code' => 'EMP-9007', 'name' => 'WithAcct', 'email' => 'wa@x.test']);
        User::factory()->create(['employee_id' => $withAcct->id]);
        $without = Employee::create(['code' => 'EMP-9008', 'name' => 'WithoutAcct', 'email' => 'wo@x.test']);

        $hasCodes = collect($this->getJson('/api/employees?page=1&status=has_account')->json('data'))->pluck('code');
        $noCodes = collect($this->getJson('/api/employees?page=1&status=no_account')->json('data'))->pluck('code');

        $this->assertTrue($hasCodes->contains('EMP-9007'));
        $this->assertFalse($hasCodes->contains('EMP-9008'));
        $this->assertTrue($noCodes->contains('EMP-9008'));
        $this->assertFalse($noCodes->contains('EMP-9007'));
    }
}
