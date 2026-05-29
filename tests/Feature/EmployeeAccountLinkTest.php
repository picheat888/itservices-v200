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
}
