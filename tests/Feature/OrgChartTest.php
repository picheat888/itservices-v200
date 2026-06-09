<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
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
        $pos = Position::create(['title' => 'Director', 'level' => 5]);
        $boss = Employee::create(['name' => 'Boss', 'position_id' => $pos->id]);
        Employee::create(['name' => 'Staff A', 'manager_id' => $boss->id]);
        Employee::create(['name' => 'Staff B', 'manager_id' => $boss->id]);

        $res = $this->getJson('/api/employees/org-chart')->assertOk();

        $res->assertJsonCount(3, 'data');
        $boss_row = collect($res->json('data'))->firstWhere('name', 'Boss');
        $this->assertSame(2, $boss_row['reports_count']);
        $this->assertSame('Director', $boss_row['title']);
        $this->assertSame(5, $boss_row['level']);
    }

    public function test_leaf_employee_has_null_position_department_and_zero_reports(): void
    {
        $this->actingAs($this->super());
        Employee::create(['name' => 'Lone Worker']); // no position, no department, no reports

        $row = $this->getJson('/api/employees/org-chart')->assertOk()->json('data.0');

        $this->assertSame('Lone Worker', $row['name']);
        $this->assertNull($row['title']);
        $this->assertNull($row['department']);
        $this->assertNull($row['level']);
        $this->assertSame(0, $row['reports_count']);
    }

    public function test_excludes_resigned_employees(): void
    {
        $this->actingAs($this->super());
        Employee::create(['name' => 'Active One']);
        Employee::create(['name' => 'Gone', 'status' => 'resigned']);

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
