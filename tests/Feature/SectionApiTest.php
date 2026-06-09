<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SectionApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_section_belongs_to_department_and_has_employees(): void
    {
        $dept = Department::create(['name' => 'IT']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Network', 'name_th' => 'เครือข่าย']);
        Employee::create(['name' => 'A', 'department_id' => $dept->id, 'section_id' => $section->id]);

        $this->assertSame($dept->id, $section->department->id);
        $this->assertCount(1, $section->employees);
        $this->assertTrue($dept->sections->contains($section));
    }

    public function test_deleting_a_department_cascades_its_sections(): void
    {
        $dept = Department::create(['name' => 'Ops']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Line']);
        $dept->delete();

        $this->assertDatabaseMissing('sections', ['id' => $section->id]);
    }

    public function test_deleting_a_section_nulls_employee_section_id(): void
    {
        $dept = Department::create(['name' => 'QA']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Inspect']);
        $emp = Employee::create(['name' => 'B', 'department_id' => $dept->id, 'section_id' => $section->id]);

        $section->delete();

        $this->assertNull($emp->fresh()->section_id);
    }
}
