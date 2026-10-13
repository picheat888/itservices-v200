<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An employee's last working day may never fall before their start date — neither when the
 * resignation is recorded nor when the start date is edited afterwards.
 */
class EmployeeResignDatesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
    }

    private function employee(array $attributes = []): Employee
    {
        return Employee::create(['code' => 'EMP-9101', 'first_name' => 'Date', 'last_name' => 'Check', 'joined_at' => '2026-10-03', ...$attributes]);
    }

    public function test_resign_refuses_a_last_day_before_the_start_date(): void
    {
        $employee = $this->employee();

        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on', 'last_day' => '2026-09-28'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('last_day');

        $this->assertSame('active', $employee->fresh()->status->value);
    }

    public function test_resign_accepts_a_last_day_on_the_start_date(): void
    {
        $employee = $this->employee();

        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on', 'last_day' => '2026-10-03'])
            ->assertOk();

        $this->assertSame('2026-10-03', $employee->fresh()->last_day->toDateString());
    }

    public function test_resign_without_a_recorded_start_date_accepts_any_last_day(): void
    {
        $employee = $this->employee(['joined_at' => null]);

        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on', 'last_day' => '2020-01-01'])
            ->assertOk();
    }

    public function test_editing_a_leavers_start_date_past_their_last_day_is_refused(): void
    {
        $employee = $this->employee(['status' => 'resigned', 'last_day' => '2026-10-20']);

        $this->putJson("/api/employees/{$employee->id}", ['first_name' => 'Date', 'last_name' => 'Check', 'joined_at' => '2026-10-21'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('joined_at');

        $this->assertSame('2026-10-03', $employee->fresh()->joined_at->toDateString());
    }

    public function test_editing_a_leavers_start_date_up_to_their_last_day_is_allowed(): void
    {
        $employee = $this->employee(['status' => 'resigned', 'last_day' => '2026-10-20']);

        $this->putJson("/api/employees/{$employee->id}", ['first_name' => 'Date', 'last_name' => 'Check', 'joined_at' => '2026-10-20'])
            ->assertOk();

        $this->assertSame('2026-10-20', $employee->fresh()->joined_at->toDateString());
    }

    public function test_editing_a_working_employees_start_date_has_no_upper_bound(): void
    {
        $employee = $this->employee();

        $this->putJson("/api/employees/{$employee->id}", ['first_name' => 'Date', 'last_name' => 'Check', 'joined_at' => '2027-01-15'])
            ->assertOk();
    }
}
