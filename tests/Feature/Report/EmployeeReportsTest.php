<?php

namespace Tests\Feature\Report;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * What both employee reports share — "ภาพรวมพนักงาน" (employees.overview) and
 * "สรุปเรื่องค้างของพนักงาน" (employees.open_items): the permission and the PDF export.
 */
class EmployeeReportsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @param array<string, mixed> $attributes */
    private function employee(string $name, array $attributes = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'code' => sprintf('EMP-%03d', $this->seq), 'first_name' => $name, 'last_name' => 'Test',
            'joined_at' => '2024-01-01', 'status' => 'active',
        ], $attributes));
    }

    public function test_employee_reports_need_employees_view(): void
    {
        $assetsOnly = $this->userWith([...$this->reportRights('assets')]);

        foreach (['employees.overview', 'employees.open_items'] as $key) {
            $this->actingAs($assetsOnly)->getJson("/api/reports/tabular/{$key}/rows")->assertForbidden();
        }
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-20']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'status' => 'pending_return']);
        $user = $this->userWith([...$this->reportRights('employees')]);

        foreach (['employees.overview', 'employees.open_items'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/tabular/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
