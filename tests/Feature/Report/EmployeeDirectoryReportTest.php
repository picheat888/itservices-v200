<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "รายชื่อพนักงาน" (employees.directory): every employee for HR to check — the rows, the filters,
 * the four tiles and the 14-column rows sheet.
 */
class EmployeeDirectoryReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private const SHEET_HEADINGS = [
        'รหัสพนักงาน', 'ชื่อ (ไทย)', 'นามสกุล (ไทย)', 'ชื่อ (อังกฤษ)', 'นามสกุล (อังกฤษ)', 'ตำแหน่ง', 'หน่วยงาน',
        'แผนก', 'อีเมล', 'หัวหน้างาน', 'เริ่มงาน', 'สถานะ', 'เบอร์โทรศัพท์', 'Username',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-11-26 10:00:00');
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

    private function reader(): User
    {
        return $this->userWith([...$this->reportRights('employees')]);
    }

    /** @param array<string, mixed> $attributes */
    private function employee(string $code, array $attributes = []): Employee
    {
        return Employee::create(array_merge([
            'code' => $code, 'first_name' => "First{$code}", 'last_name' => 'Last',
            'first_name_th' => 'ชื่อ', 'last_name_th' => 'สกุล', 'joined_at' => '2024-01-01', 'status' => 'active',
        ], $attributes));
    }

    /** @return list<array<string, mixed>> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->reader())
            ->getJson('/api/reports/tabular/employees.directory/rows?per_page=100'.$query)->assertOk()->json('data');
    }

    /** @return array{0: Employee, 1: Employee, 2: Employee, 3: Department, 4: Section} boss, leaver, staff, IT, Infra */
    private function team(): array
    {
        $it = Department::create(['code' => 'IT', 'name' => 'Information Technology', 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ']);
        $infra = Section::create(['code' => 'INF', 'department_id' => $it->id, 'name' => 'Infra', 'name_th' => 'ส่วนงานโครงสร้างพื้นฐาน']);
        $leader = Position::create(['code' => 'LD', 'title' => 'Leader']);
        $boss = $this->employee('100001', ['department_id' => $it->id]);
        $leaver = $this->employee('150003', ['status' => 'resigned', 'last_day' => '2026-06-30']);
        $staff = $this->employee('200002', [
            'department_id' => $it->id, 'section_id' => $infra->id, 'position_id' => $leader->id, 'manager_id' => $boss->id,
            'email' => 'staff@x.co', 'phone' => '081-245-7730', 'username' => 'staff.user',
        ]);

        return [$boss, $leaver, $staff, $it, $infra];
    }

    public function test_rows_list_everyone_by_code_with_the_screen_columns(): void
    {
        [, , $staff] = $this->team();

        $list = $this->rows();
        $rows = collect($list)->keyBy('code');

        $this->assertSame(['100001', '150003', '200002'], array_column($list, 'code'));
        $row = $rows['200002'];
        $this->assertSame('ชื่อ สกุล', $row['name_th']);
        $this->assertSame('First200002 Last', $row['name_en']);
        $this->assertSame('Leader', $row['position']);
        $this->assertSame('ฝ่ายเทคโนโลยีสารสนเทศ', $row['department']['name_th']);
        $this->assertSame('Infra', $row['section']['name']);
        $this->assertSame('First100001 Last', $row['manager']['name']);
        $this->assertSame('2024-01-01', $row['joined_at']);
        $this->assertSame('active', $row['status']);
        $this->assertSame('staff@x.co', $row['email']);
        $this->assertSame('081-245-7730', $row['phone']);
        $this->assertSame('staff.user', $row['username']);
        $this->assertSame("/employees?view={$staff->id}", $row['_links']['code']);
        $this->assertSame('resigned', $rows['150003']['status']);
    }

    public function test_rows_handle_an_employee_with_no_optional_data(): void
    {
        $this->employee('300004', ['first_name_th' => null, 'last_name_th' => null]);

        $row = $this->rows()[0];

        foreach (['name_th', 'department', 'section', 'position', 'manager', 'email', 'phone', 'username'] as $key) {
            $this->assertNull($row[$key], $key);
        }
        $this->assertSame('active', $row['status']);
    }

    public function test_filters_narrow_by_department_section_status_and_search(): void
    {
        [, , , $it, $infra] = $this->team();
        $this->employee('400005', ['first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        $codes = fn (string $query) => array_column($this->rows($query), 'code');

        $this->assertSame(['150003'], $codes('&status=resigned'));
        $this->assertSame(['100001', '200002'], $codes("&department_id={$it->id}"));
        $this->assertSame(['200002'], $codes("&section_id={$infra->id}"));
        $this->assertSame(['400005'], $codes('&search=สมชาย'));
        $this->assertSame(['200002'], $codes('&search=First200002'));
        $this->assertSame(['200002'], $codes('&search=staff@x.co'));
        $this->assertSame(['200002'], $codes('&search=staff.user'));
        $this->assertSame(['200002'], $codes('&search='.urlencode('First200002 Last')));
        $this->actingAs($this->reader())->getJson('/api/reports/tabular/employees.directory/rows?status=gone')->assertStatus(422);
    }

    public function test_tiles_count_people_departments_leavers_this_year_and_missing_thai_names(): void
    {
        $it = Department::create(['code' => 'IT', 'name' => 'IT']);
        $hr = Department::create(['code' => 'HR', 'name' => 'HR']);
        $this->employee('A', ['department_id' => $it->id]);
        $this->employee('B', ['department_id' => $hr->id, 'last_name_th' => null]);
        $this->employee('C', ['department_id' => $it->id, 'first_name_th' => '  ']);
        $this->employee('D', ['status' => 'resigned', 'last_day' => '2026-03-31', 'first_name_th' => null, 'last_name_th' => null]);
        $this->employee('E', ['status' => 'resigned', 'last_day' => '2025-12-31']);
        $this->employee('F', ['status' => 'resigned', 'last_day' => null]);
        $tiles = fn (string $query = '') => collect($this->actingAs($this->reader())
            ->getJson('/api/reports/tabular/employees.directory/summary'.$query)->assertOk()->json('data.summary'))->keyBy('key');

        $all = $tiles();

        $this->assertSame(6, $all['total']['value']);
        $this->assertSame(['label_key' => 'rep_n_ed_departments', 'values' => ['n' => 2]], $all['total']['note']);
        $this->assertSame(3, $all['active']['value']);
        $this->assertEquals(50, $all['active']['note']['values']['pct']);
        $this->assertSame(3, $all['resigned']['value']);
        $this->assertSame(['label_key' => 'rep_n_ed_left_this_year', 'values' => ['n' => 1]], $all['resigned']['note']);
        $this->assertSame(2, $all['no_thai_name']['value']);
        $this->assertSame('amber', $all['no_thai_name']['tone']);
        $this->assertSame('rep_n_ed_active_only', $all['no_thai_name']['note']['label_key']);
        $this->assertSame(3, $tiles('?status=resigned')['total']['value']);

        $report = ReportCatalogue::tabular('employees.directory');
        $this->assertContains(['สถานะ', 'ลาออก'], $report->scopeLines($report->resolveFilters(['status' => 'resigned'])));
    }

    public function test_sheet_carries_fourteen_columns_in_order_with_blank_missing_values(): void
    {
        Excel::fake();
        $this->employee('007120', ['first_name' => 'Kenji', 'last_name' => 'Tanaka', 'first_name_th' => null, 'last_name_th' => null, 'joined_at' => '2015-08-10']);

        $this->actingAs($this->reader())->exportReport('/api/reports/tabular/employees.directory/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_employees-directory_2026-11-26.xlsx', function (TabularReportExport $export) {
            $sheet = $this->rowsSheet($export);
            $row = $sheet->map($export->rows->first());

            return array_map(fn (object $s) => $s->title(), $export->sheets()) === ['สรุป', 'ข้อมูลดิบ', 'คำอธิบายคอลัมน์']
                && $sheet->headings() === self::SHEET_HEADINGS
                && $row[0] === '007120'
                && $row[1] === null && $row[2] === null
                && $row[3] === 'Kenji'
                && $this->excelDate($row[10], 'Y-m-d') === '2015-08-10'
                && $row[11] === 'ใช้งาน';
        });
    }

    public function test_rows_do_not_query_per_employee(): void
    {
        [$boss, , , $it, $infra] = $this->team();
        $reader = $this->reader();
        $url = '/api/reports/tabular/employees.directory/rows?per_page=100';
        // Settings and role lookups refill their cache once after a write, so each count reads a warm second request.
        $count = function () use ($reader, $url): int {
            $this->actingAs($reader)->getJson($url)->assertOk();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($reader)->getJson($url)->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $few = $count();
        foreach (range(1, 10) as $i) {
            $this->employee((string) (500000 + $i), ['department_id' => $it->id, 'section_id' => $infra->id, 'manager_id' => $boss->id]);
        }

        $this->assertSame($few, $count());
    }
}
