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
        Employee::create(['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $dept->id, 'section_id' => $section->id]);

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
        $emp = Employee::create(['first_name' => 'B', 'last_name' => 'Test', 'department_id' => $dept->id, 'section_id' => $section->id]);

        $section->delete();

        $this->assertNull($emp->fresh()->section_id);
    }

    public function test_lists_sections_filtered_by_department_with_member_counts(): void
    {
        $this->actingAs($this->super());
        $it = Department::create(['name' => 'IT']);
        $hr = Department::create(['name' => 'HR']);
        $net = Section::create(['department_id' => $it->id, 'name' => 'Network']);
        Section::create(['department_id' => $hr->id, 'name' => 'Payroll']);
        Employee::create(['first_name' => 'A', 'last_name' => 'Test', 'department_id' => $it->id, 'section_id' => $net->id]);

        $this->getJson("/api/sections?department_id={$it->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Network')
            ->assertJsonPath('data.0.department', 'IT')
            ->assertJsonPath('data.0.members_count', 1);
    }

    public function test_creates_updates_and_deletes_a_section(): void
    {
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'IT']);

        $created = $this->postJson('/api/sections', ['department_id' => $dept->id, 'name' => 'Network', 'name_th' => 'เครือข่าย'])
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'Network')
            ->json('data.id');

        $this->putJson("/api/sections/{$created}", ['department_id' => $dept->id, 'name' => 'Networking'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Networking');

        $this->deleteJson("/api/sections/{$created}")->assertOk();
        $this->assertDatabaseMissing('sections', ['id' => $created]);
    }

    public function test_section_write_requires_org_manage_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $dept = Department::create(['name' => 'IT']);
        $this->postJson('/api/sections', ['department_id' => $dept->id, 'name' => 'X'])->assertForbidden();
    }

    public function test_section_endpoints_require_authentication(): void
    {
        $this->getJson('/api/sections')->assertUnauthorized();
    }
}
