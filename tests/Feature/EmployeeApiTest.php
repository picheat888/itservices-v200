<?php

namespace Tests\Feature;

use App\Models\Employee;
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
        $e = Employee::create(['name' => 'Solo']);

        $this->putJson("/api/employees/{$e->id}", ['name' => 'Solo', 'manager_id' => $e->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('manager_id');
    }

    public function test_manager_cannot_be_a_descendant(): void
    {
        $this->actingAs($this->super());
        $boss = Employee::create(['name' => 'Boss']);
        $staff = Employee::create(['name' => 'Staff', 'manager_id' => $boss->id]);

        // Making the boss report to its own subordinate must fail.
        $this->putJson("/api/employees/{$boss->id}", ['name' => 'Boss', 'manager_id' => $staff->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('manager_id');
    }

    public function test_valid_manager_is_accepted(): void
    {
        $this->actingAs($this->super());
        $boss = Employee::create(['name' => 'Boss']);
        $staff = Employee::create(['name' => 'Staff']);

        $this->putJson("/api/employees/{$staff->id}", ['name' => 'Staff', 'manager_id' => $boss->id])
            ->assertOk();
        $this->assertSame($boss->id, $staff->fresh()->manager_id);
    }
}
