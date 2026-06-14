<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_employee_cannot_be_their_own_manager(): void
    {
        $this->actingAs($this->super());
        $e = Employee::create(['first_name' => 'Solo', 'last_name' => 'Test']);

        $this->putJson("/api/employees/{$e->id}", ['first_name' => 'Solo', 'last_name' => 'Test', 'manager_id' => $e->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('manager_id');
    }

    public function test_manager_cannot_be_a_descendant(): void
    {
        $this->actingAs($this->super());
        $boss = Employee::create(['first_name' => 'Boss', 'last_name' => 'Test']);
        $staff = Employee::create(['first_name' => 'Staff', 'last_name' => 'Test', 'manager_id' => $boss->id]);

        // Making the boss report to its own subordinate must fail.
        $this->putJson("/api/employees/{$boss->id}", ['first_name' => 'Boss', 'last_name' => 'Test', 'manager_id' => $staff->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('manager_id');
    }

    public function test_valid_manager_is_accepted(): void
    {
        $this->actingAs($this->super());
        $boss = Employee::create(['first_name' => 'Boss', 'last_name' => 'Test']);
        $staff = Employee::create(['first_name' => 'Staff', 'last_name' => 'Test']);

        $this->putJson("/api/employees/{$staff->id}", ['first_name' => 'Staff', 'last_name' => 'Test', 'manager_id' => $boss->id])
            ->assertOk();
        $this->assertSame($boss->id, $staff->fresh()->manager_id);
    }

    public function test_section_in_the_same_department_is_accepted(): void
    {
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'IT']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Network']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $dept->id]);

        $this->putJson("/api/employees/{$e->id}", ['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $dept->id, 'section_id' => $section->id])
            ->assertOk();
        $this->assertSame($section->id, $e->fresh()->section_id);
    }

    public function test_section_from_a_different_department_is_rejected(): void
    {
        $this->actingAs($this->super());
        $it = Department::create(['name' => 'IT']);
        $hr = Department::create(['name' => 'HR']);
        $hrSection = Section::create(['department_id' => $hr->id, 'name' => 'Payroll']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $it->id]);

        $this->putJson("/api/employees/{$e->id}", ['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $it->id, 'section_id' => $hrSection->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('section_id');
    }

    public function test_null_section_is_allowed(): void
    {
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'IT']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $dept->id]);

        $this->putJson("/api/employees/{$e->id}", ['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $dept->id, 'section_id' => null])
            ->assertOk();
    }
}
