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
}
