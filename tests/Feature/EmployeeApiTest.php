<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_normal_position_requires_department_section_and_report_to(): void
    {
        $this->actingAs($this->super());
        $position = Position::create(['title' => 'Operator']); // allow_special_position defaults to false
        $emp = Employee::create(['first_name' => 'No', 'last_name' => 'Org']);

        $this->putJson("/api/employees/{$emp->id}", ['first_name' => 'No', 'last_name' => 'Org', 'position_id' => $position->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_id', 'section_id', 'manager_id']);
    }

    public function test_special_position_skips_department_and_report_to(): void
    {
        $this->actingAs($this->super());
        $position = Position::create(['title' => 'Managing Director', 'allow_special_position' => true]);
        $emp = Employee::create(['first_name' => 'Top', 'last_name' => 'Boss']);

        $this->putJson("/api/employees/{$emp->id}", ['first_name' => 'Top', 'last_name' => 'Boss', 'position_id' => $position->id])
            ->assertOk();
        $this->assertSame($position->id, $emp->fresh()->position_id);
        $this->assertNull($emp->fresh()->department_id);
        $this->assertNull($emp->fresh()->manager_id);
    }

    public function test_update_with_photo_saves_the_file(): void
    {
        Storage::fake('public');
        $this->actingAs($this->super());
        // Special position so department/section/report-to aren't required — isolate the photo path.
        $position = Position::create(['title' => 'MD', 'allow_special_position' => true]);
        $emp = Employee::create(['first_name' => 'Pic', 'last_name' => 'Test']);
        $file = UploadedFile::fake()->image('avatar.png', 600, 600);

        // Mirror the frontend: multipart POST with spoofed PUT.
        $this->post("/api/employees/{$emp->id}", [
            '_method' => 'PUT',
            'first_name' => 'Pic',
            'last_name' => 'Test',
            'position_id' => $position->id,
            'photo' => $file,
        ])->assertOk();

        $path = $emp->fresh()->photo_path;
        $this->assertNotNull($path, 'photo_path should be set after upload');
        Storage::disk('public')->assertExists($path);
    }

    public function test_update_full_payload_with_photo_like_the_form(): void
    {
        Storage::fake('public');
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'IT']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Network']);
        $position = Position::create(['title' => 'Operator']); // normal → dept/section/report-to required
        $boss = Employee::create(['first_name' => 'Boss', 'last_name' => 'Test']);
        $emp = Employee::create(['first_name' => 'Pic', 'last_name' => 'Full', 'code' => 'EMP-9001']);
        $file = UploadedFile::fake()->image('avatar.png', 600, 600);

        $this->post("/api/employees/{$emp->id}", [
            '_method' => 'PUT',
            'first_name' => 'Pic',
            'last_name' => 'Full',
            'code' => 'EMP-9001', // its own code — must be ignored by the unique rule
            'department_id' => $dept->id,
            'section_id' => $section->id,
            'position_id' => $position->id,
            'manager_id' => $boss->id,
            'email' => 'pic@x.co',
            'phone' => '0800000000',
            'joined_at' => '2024-01-15',
            'photo' => $file,
        ])->assertOk();

        $this->assertNotNull($emp->fresh()->photo_path);
        $this->assertSame($section->id, $emp->fresh()->section_id);
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

    /**
     * The Employee detail's Assets tab reads the held-assets list — gated by employees.view
     * (an Employee-module read), so an employee viewer needs no asset permission.
     */
    public function test_employees_view_can_list_an_employees_held_assets(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'employees.view', 'allowed' => true]);
        $emp = Employee::create(['first_name' => 'Holder', 'last_name' => 'Person']);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $emp->id, 'tag' => 'NB-1']);

        $this->actingAs($viewer);
        $this->getJson("/api/employees/{$emp->id}/assets")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tag', 'NB-1');
    }

    /** Listing an employee's held assets requires employees.view. */
    public function test_held_assets_require_employees_view(): void
    {
        $emp = Employee::create(['first_name' => 'X', 'last_name' => 'Y']);
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson("/api/employees/{$emp->id}/assets")->assertForbidden();
    }
}
