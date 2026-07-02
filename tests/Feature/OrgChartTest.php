<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrgChartTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_returns_active_employees_with_report_counts(): void
    {
        $this->actingAs($this->super());
        $pos = Position::create(['title' => 'Director']);
        $boss = Employee::create(['first_name' => 'Boss', 'position_id' => $pos->id]);
        Employee::create(['first_name' => 'Staff', 'last_name' => 'A', 'manager_id' => $boss->id]);
        Employee::create(['first_name' => 'Staff', 'last_name' => 'B', 'manager_id' => $boss->id]);

        $res = $this->getJson('/api/employees/org-chart')->assertOk();

        $res->assertJsonCount(3, 'data');
        $boss_row = collect($res->json('data'))->firstWhere('name', 'Boss');
        $this->assertSame(2, $boss_row['reports_count']);
        $this->assertSame('Director', $boss_row['title']);
    }

    public function test_leaf_employee_has_null_position_department_and_zero_reports(): void
    {
        $this->actingAs($this->super());
        Employee::create(['first_name' => 'Lone', 'last_name' => 'Worker']); // no position, no department, no reports

        $row = $this->getJson('/api/employees/org-chart')->assertOk()->json('data.0');

        $this->assertSame('Lone Worker', $row['name']);
        $this->assertNull($row['title']);
        $this->assertNull($row['department']);
        $this->assertSame(0, $row['reports_count']);
    }

    public function test_excludes_resigned_employees(): void
    {
        $this->actingAs($this->super());
        Employee::create(['first_name' => 'Active', 'last_name' => 'One']);
        Employee::create(['first_name' => 'Gone', 'status' => 'resigned']);

        $this->getJson('/api/employees/org-chart')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Active One');
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/employees/org-chart')->assertUnauthorized();
    }

    public function test_requires_employees_view_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/employees/org-chart')->assertForbidden();
    }
}
