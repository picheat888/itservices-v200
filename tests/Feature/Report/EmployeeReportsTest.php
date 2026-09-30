<?php

namespace Tests\Feature\Report;

use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * The two employee tabular reports — "พนักงานเข้าใหม่และลาออก" (employees.joiners_leavers) and
 * "ทรัพย์สินค้างคืนจากผู้ลาออก" (employees.leaver_assets) — through /reports/r/{key}.
 */
class EmployeeReportsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

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

    private function onboarding(Employee $employee, string $status): ServiceRequest
    {
        return ServiceRequest::create([
            'type' => 'computer', 'origin' => 'onboarding', 'employee_id' => $employee->id,
            'requester_name' => $employee->name, 'title' => 'Computer', 'reason' => 'New starter.', 'status' => $status,
        ]);
    }

    // ── employees.joiners_leavers ───────────────────────────────────────────────────

    public function test_joiners_and_leavers_of_the_month_in_date_order(): void
    {
        $preparing = $this->employee('Preparing', ['joined_at' => '2026-09-10']);
        $this->onboarding($preparing, 'pending');
        $this->onboarding($preparing, 'completed');
        $ready = $this->employee('Ready', ['joined_at' => '2026-09-15']);
        $this->onboarding($ready, 'completed');
        $none = $this->employee('None', ['joined_at' => '2026-09-20']);
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-28', 'resign_reason' => 'Moving']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'status' => 'pending_return']);
        $both = $this->employee('Both', ['joined_at' => '2026-09-05', 'status' => 'resigned', 'last_day' => '2026-09-29']);
        $this->employee('Last month', ['joined_at' => '2026-08-01']);
        $this->employee('Left last month', ['status' => 'resigned', 'last_day' => '2026-08-15']);

        $body = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.joiners_leavers/rows')->assertOk()->json();

        $this->assertSame([$preparing->id, $ready->id, $none->id, $leaver->id, $both->id], array_column($body['data'], 'id'));
        $rows = collect($body['data'])->keyBy('id');
        $this->assertSame('joined', $rows[$preparing->id]['movement_kind']);
        $this->assertSame('2026-09-10', $rows[$preparing->id]['movement_date']);
        $this->assertSame('preparing', $rows[$preparing->id]['prep_status']);
        $this->assertSame('1/2', $rows[$preparing->id]['onboarding']);
        $this->assertSame('ready', $rows[$ready->id]['prep_status']);
        $this->assertSame('none', $rows[$none->id]['prep_status']);
        $this->assertSame('left', $rows[$leaver->id]['movement_kind']);
        $this->assertSame('2026-09-28', $rows[$leaver->id]['movement_date']);
        $this->assertNull($rows[$leaver->id]['prep_status']);
        $this->assertEquals(1, $rows[$leaver->id]['assets_held']);
        $this->assertSame('Moving', $rows[$leaver->id]['resign_reason']);
        $this->assertSame('left', $rows[$both->id]['movement_kind']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(5, $summary['total']['value']);
        $this->assertSame(3, $summary['joined']['value']);
        $this->assertSame(2, $summary['left']['value']);
        $this->assertSame(1, $summary['preparing']['value']);
    }

    public function test_joiners_and_leavers_filter_by_kind_department_and_range(): void
    {
        $user = $this->userWith(['employees.view']);
        $it = Department::create(['name' => 'IT']);
        $joiner = $this->employee('Joiner', ['joined_at' => '2026-09-10', 'department_id' => $it->id]);
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-12']);
        $noLastDay = $this->employee('No last day', ['joined_at' => '2026-09-11', 'status' => 'resigned']);
        $august = $this->employee('August', ['joined_at' => '2026-08-20']);

        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/employees.joiners_leavers/rows?'.$query)->assertOk()->json('data'), 'id');

        // Resigned without a last day yet still reads as a joiner.
        $this->assertSame([$joiner->id, $noLastDay->id], $ids('kind=joined'));
        $this->assertSame([$leaver->id], $ids('kind=left'));
        $this->assertSame([$joiner->id], $ids('department_id='.$it->id));
        $this->assertSame([$august->id], $ids('from=2026-08-01&to=2026-08-31'));
    }

    // ── employees.leaver_assets ─────────────────────────────────────────────────────

    public function test_leaver_assets_lists_what_resigned_people_still_hold(): void
    {
        $gone = $this->employee('Gone', ['status' => 'resigned', 'last_day' => '2026-09-20']);
        $leaving = $this->employee('Leaving', ['status' => 'resigned', 'last_day' => '2026-10-05']);
        $staying = $this->employee('Staying');
        $late = Asset::factory()->create(['owner_employee_id' => $leaving->id, 'owner' => null, 'status' => 'deployed']);
        $overdue = Asset::factory()->create(['owner_employee_id' => $gone->id, 'owner' => null, 'status' => 'pending_return']);
        Asset::factory()->create(['owner_employee_id' => $staying->id, 'owner' => null, 'status' => 'deployed']);

        $body = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.leaver_assets/rows')->assertOk()->json();

        $this->assertSame([$overdue->id, $late->id], array_column($body['data'], 'id'));
        $this->assertEquals(-5, $body['data'][0]['days_left']);
        $this->assertEquals(10, $body['data'][1]['days_left']);
        $this->assertStringContainsString($gone->code, $body['data'][0]['holder']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(2, $summary['leavers']['value']);
        $this->assertSame(1, $summary['past_last_day']['value']);
        $this->assertSame(1, $summary['pending_return']['value']);

        $search = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.leaver_assets/rows?search=Leaving')->assertOk()->json('data');
        $this->assertSame([$late->id], array_column($search, 'id'));
    }

    public function test_employee_reports_need_employees_view(): void
    {
        $assetsOnly = $this->userWith(['assets.view']);

        foreach (['employees.joiners_leavers', 'employees.leaver_assets'] as $key) {
            $this->actingAs($assetsOnly)->getJson("/api/reports/r/{$key}/rows")->assertForbidden();
        }
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-20']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'status' => 'pending_return']);
        $user = $this->userWith(['employees.view']);

        foreach (['employees.joiners_leavers', 'employees.leaver_assets'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/r/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
