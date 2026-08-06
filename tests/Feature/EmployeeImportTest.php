<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\User;
use App\Services\Employee\EmployeeImportService;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\PositionSeeder;
use Database\Seeders\SectionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * Covers the CSV employee import: how the free-text department / section / position
 * columns are matched against the master data, how the reporting line is resolved
 * from employee codes, and which rows the org-chart rules reject.
 */
class EmployeeImportTest extends TestCase
{
    use RefreshDatabase;

    private EmployeeImportService $service;

    private Department $it;

    private Department $qc;

    private Section $support;

    private Position $staff;

    private Position $vicePresident;

    private Employee $boss;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(EmployeeImportService::class);

        $this->it = Department::create(['code' => 'DEP-0003', 'tag' => 'It', 'name' => 'Information Technology', 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ']);
        $this->qc = Department::create(['code' => 'DEP-0010', 'tag' => 'QC', 'name' => 'Quality Control', 'name_th' => 'ฝ่ายควบคุมคุณภาพ']);

        $this->support = Section::create(['code' => 'SEC-0002', 'department_id' => $this->it->id, 'name' => 'Support']);
        Section::create(['code' => 'SEC-0004', 'department_id' => $this->qc->id, 'name' => 'Quality Control']);

        $this->staff = Position::create(['code' => 'PST-0013', 'title' => 'Staff/Officer', 'allow_special_position' => false]);
        $this->vicePresident = Position::create(['code' => 'PST-0001', 'title' => 'Vice President', 'allow_special_position' => true]);

        $this->boss = Employee::create([
            'code' => 'EMP-1005',
            'first_name' => 'Big',
            'last_name' => 'Boss',
            'position_id' => $this->vicePresident->id,
            'status' => EmployeeStatus::Active,
        ]);
    }

    /**
     * Builds one CSV row keyed exactly like the template headers, so the tests
     * exercise the same column names the downloaded file carries.
     *
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function row(array $overrides = []): array
    {
        return array_merge([
            'employee_code' => '',
            'first_name' => 'Somchai',
            'last_name' => 'Jaidee',
            'first_name_th' => 'สมชาย',
            'last_name_th' => 'ใจดี',
            'email' => '',
            'phone' => '',
            'department' => 'It',
            'section' => 'Support',
            'position' => 'Staff/Officer',
            'joined_at' => '2024-01-15',
            'report_to_employee_code' => 'EMP-1005',
        ], $overrides);
    }

    public function test_matches_department_section_and_position_by_text_case_insensitively(): void
    {
        $result = $this->service->importRows([
            $this->row([
                'department' => 'ฝ่ายเทคโนโลยีสารสนเทศ',   // department by Thai name
                'section' => 'support',                    // section by name, lower-cased
                'position' => 'staff/officer',             // position by title, lower-cased
            ]),
        ]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(1, $result['imported']);

        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $this->assertSame($this->it->id, $employee->department_id);
        $this->assertSame($this->support->id, $employee->section_id);
        $this->assertSame($this->staff->id, $employee->position_id);
        $this->assertSame($this->boss->id, $employee->manager_id);
        $this->assertSame('2024-01-15', $employee->joined_at->format('Y-m-d'));
    }

    public function test_matches_department_by_tag_and_code_too(): void
    {
        $result = $this->service->importRows([
            $this->row(['employee_code' => 'EMP-2001', 'department' => 'It']),
            $this->row(['employee_code' => 'EMP-2002', 'first_name' => 'Somsri', 'department' => 'DEP-0003']),
        ]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(2, $result['imported']);
        $this->assertSame(2, Employee::where('department_id', $this->it->id)->count());
    }

    public function test_section_must_belong_to_the_department_on_the_same_row(): void
    {
        // "Quality Control" IS a section — but of the QC department, not of IT.
        $result = $this->service->importRows([
            $this->row(['department' => 'It', 'section' => 'Quality Control']),
        ]);

        $this->assertSame(0, $result['imported']);
        $this->assertCount(1, $result['errors']);
        $this->assertStringContainsString('section', $result['errors'][0]['message']);
        $this->assertSame(2, $result['errors'][0]['row']);
        $this->assertSame(0, Employee::where('first_name', 'Somchai')->count());
    }

    public function test_unknown_position_text_is_reported(): void
    {
        $result = $this->service->importRows([
            $this->row(['position' => 'Chief Happiness Officer']),
        ]);

        $this->assertSame(0, $result['imported']);
        $this->assertStringContainsString('position', $result['errors'][0]['message']);
    }

    public function test_department_text_matching_two_departments_is_reported_as_ambiguous(): void
    {
        // A tag on one department that is another department's name: 'Sales' hits both.
        Department::create(['code' => 'DEP-0004', 'tag' => 'Sales', 'name' => 'Sales Domestic', 'name_th' => null]);
        Department::create(['code' => 'DEP-0012', 'tag' => 'SLE', 'name' => 'Sales', 'name_th' => null]);

        $result = $this->service->importRows([
            $this->row(['department' => 'Sales', 'section' => '']),
        ]);

        $this->assertSame(0, $result['imported']);
        $this->assertStringContainsString('department', $result['errors'][0]['message']);
    }

    public function test_a_normal_position_requires_department_section_and_report_to(): void
    {
        $result = $this->service->importRows([
            $this->row(['department' => '', 'section' => '', 'report_to_employee_code' => '']),
        ]);

        $this->assertSame(0, $result['imported']);
        $message = $result['errors'][0]['message'];
        $this->assertStringContainsString('department', $message);
        $this->assertStringContainsString('section', $message);
        $this->assertStringContainsString('report_to_employee_code', $message);
    }

    public function test_a_special_position_may_omit_department_section_and_report_to(): void
    {
        $result = $this->service->importRows([
            $this->row([
                'first_name' => 'Taro',
                'last_name' => 'Inaba',
                'position' => 'Vice President',
                'department' => '',
                'section' => '',
                'report_to_employee_code' => '',
            ]),
        ]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(1, $result['imported']);

        $employee = Employee::where('first_name', 'Taro')->firstOrFail();
        $this->assertNull($employee->department_id);
        $this->assertNull($employee->manager_id);
    }

    public function test_report_to_may_reference_a_manager_defined_further_down_the_file(): void
    {
        $result = $this->service->importRows([
            // The subordinate comes first and points at a code created by the row below it.
            $this->row(['first_name' => 'Junior', 'report_to_employee_code' => 'EMP-3001']),
            $this->row([
                'employee_code' => 'EMP-3001',
                'first_name' => 'Senior',
                'position' => 'Vice President',
                'department' => '',
                'section' => '',
                'report_to_employee_code' => '',
            ]),
        ]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(2, $result['imported']);

        $junior = Employee::where('first_name', 'Junior')->firstOrFail();
        $senior = Employee::where('code', 'EMP-3001')->firstOrFail();
        $this->assertSame($senior->id, $junior->manager_id);
    }

    public function test_report_to_pointing_at_an_unknown_code_is_reported(): void
    {
        $result = $this->service->importRows([
            $this->row(['report_to_employee_code' => 'EMP-9999']),
        ]);

        $this->assertSame(0, $result['imported']);
        $this->assertStringContainsString('EMP-9999', $result['errors'][0]['message']);
    }

    public function test_a_reporting_loop_inside_the_file_is_reported(): void
    {
        $result = $this->service->importRows([
            $this->row(['employee_code' => 'EMP-4001', 'first_name' => 'Aaa', 'report_to_employee_code' => 'EMP-4002']),
            $this->row(['employee_code' => 'EMP-4002', 'first_name' => 'Bbb', 'report_to_employee_code' => 'EMP-4001']),
        ]);

        $this->assertSame(0, $result['imported']);
        $this->assertNotEmpty($result['errors']);
        $this->assertSame(0, Employee::whereIn('code', ['EMP-4001', 'EMP-4002'])->count());
    }

    public function test_still_accepts_the_legacy_code_column_name(): void
    {
        $row = $this->row();
        unset($row['employee_code']);
        $row['code'] = 'EMP-5001';

        $result = $this->service->importRows([$row]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(1, Employee::where('code', 'EMP-5001')->count());
    }

    /**
     * The real org chart, not a fixture: several departments carry a section of the same
     * name (Purchasing, Maintenance, Accounting…), and every department's tag is short
     * enough to collide with something. This pins that the spellings actually in use
     * resolve to exactly one record each — an org chart that grows a genuinely ambiguous
     * name should fail here, not silently attach people to the wrong unit.
     */
    public function test_the_seeded_org_chart_resolves_the_spellings_people_actually_use(): void
    {
        $this->seed(DepartmentSeeder::class);
        $this->seed(SectionSeeder::class);
        $this->seed(PositionSeeder::class);

        $result = $this->service->importRows([
            // Department by English name, with a section that shares that exact name.
            $this->row(['first_name' => 'Aaa', 'department' => 'Purchasing', 'section' => 'Purchasing', 'position' => 'Manager']),
            // Department by Thai name, section by Thai-less English name, position by title.
            $this->row(['first_name' => 'Bbb', 'department' => 'ฝ่ายจัดซื้อ', 'section' => 'Purchasing', 'position' => 'Asst. Manager']),
            // Department by tag, one of production's nine sections.
            $this->row(['first_name' => 'Ccc', 'department' => 'PD', 'section' => 'Forklift', 'position' => 'Leader']),
            // A section whose name is also a department's name, under its own department.
            $this->row(['first_name' => 'Ddd', 'department' => 'Mn', 'section' => 'Maintenance', 'position' => 'Supervisor']),
        ]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(4, $result['imported']);

        $purchasing = Department::where('tag', 'PU')->firstOrFail();
        $this->assertSame($purchasing->id, Employee::where('first_name', 'Aaa')->firstOrFail()->department_id);
        $this->assertSame($purchasing->id, Employee::where('first_name', 'Bbb')->firstOrFail()->department_id);
        $this->assertSame('Forklift', Employee::where('first_name', 'Ccc')->firstOrFail()->section->name);
        $this->assertSame('Maintenance', Employee::where('first_name', 'Ddd')->firstOrFail()->section->name);
    }

    /** Builds a CSV file exactly as the template does — headers, UTF-8 BOM and all. */
    private function csvFile(string ...$dataLines): UploadedFile
    {
        $content = "\xEF\xBB\xBF".implode(',', EmployeeImportService::COLUMNS)."\n".implode("\n", $dataLines)."\n";

        return UploadedFile::fake()->createWithContent('employees.csv', $content);
    }

    private function importer(): User
    {
        Role::firstOrCreate(['key' => 'super'], ['name' => 'Administrator Template', 'is_system' => true]);

        return User::factory()->create(['role' => 'super']);
    }

    public function test_the_template_ships_the_section_and_reporting_columns(): void
    {
        $response = $this->actingAs($this->importer())->get('/api/employees/import-template');

        $response->assertOk();
        $csv = $response->streamedContent();
        $this->assertStringContainsString('section', $csv);
        $this->assertStringContainsString('report_to_employee_code', $csv);
        $this->assertStringContainsString('employee_code', $csv);
        // The example row is filled from the master data that actually exists.
        $this->assertStringContainsString('Support', $csv);
        $this->assertStringContainsString('EMP-1005', $csv);
    }

    public function test_the_preview_endpoint_counts_valid_rows_and_names_ignored_columns(): void
    {
        $file = UploadedFile::fake()->createWithContent('hr-export.csv', implode("\n", [
            'employee_code,first_name,last_name,department,section,position,report_to_employee_code,salary',
            ',Somchai,Jaidee,It,Support,Staff/Officer,EMP-1005,45000',
            ',Somsri,Rakdee,It,Accounting,Staff/Officer,EMP-1005,38000',
        ])."\n");

        $response = $this->actingAs($this->importer())->postJson('/api/employees/import/preview', ['file' => $file]);

        $response->assertOk();
        $response->assertJsonPath('meta.total', 2);
        $response->assertJsonPath('meta.valid', 1);
        $response->assertJsonPath('meta.invalid', 1);
        $response->assertJsonPath('meta.ignored_columns', ['salary']);
        $response->assertJsonPath('data.0.department', 'Information Technology');
        // "Accounting" is no section of IT, so the second row cannot be resolved.
        $this->assertNotEmpty($response->json('data.1.errors'));
        $this->assertSame(0, Employee::where('first_name', 'Somchai')->count());
    }

    public function test_the_import_endpoint_saves_the_rows(): void
    {
        $file = $this->csvFile(',Somchai,Jaidee,สมชาย,ใจดี,,,It,Support,Staff/Officer,2024-01-15,EMP-1005');

        $response = $this->actingAs($this->importer())->postJson('/api/employees/import', ['file' => $file]);

        $response->assertOk();
        $response->assertJsonPath('imported', 1);

        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $this->assertSame($this->support->id, $employee->section_id);
        $this->assertSame($this->boss->id, $employee->manager_id);
    }

    public function test_the_import_endpoint_writes_nothing_when_a_row_is_bad(): void
    {
        $file = $this->csvFile(
            ',Somchai,Jaidee,,,,,It,Support,Staff/Officer,2024-01-15,EMP-1005',
            ',Somsri,Rakdee,,,,,It,Quality Control,Staff/Officer,2024-01-15,EMP-1005',
        );

        $response = $this->actingAs($this->importer())->postJson('/api/employees/import', ['file' => $file]);

        $response->assertStatus(422);
        $response->assertJsonPath('errors.0.row', 3);
        $this->assertSame(0, Employee::whereIn('first_name', ['Somchai', 'Somsri'])->count());
    }

    public function test_dry_run_validates_and_previews_without_writing(): void
    {
        $result = $this->service->importRows([
            $this->row(['first_name' => 'Preview']),
        ], dryRun: true);

        $this->assertSame([], $result['errors']);
        $this->assertSame(0, $result['imported']);
        $this->assertSame(0, Employee::where('first_name', 'Preview')->count());

        // The preview carries the resolved labels so the dialog can show what will be saved.
        $this->assertCount(1, $result['rows']);
        $this->assertSame('Information Technology', $result['rows'][0]['department']);
        $this->assertSame('Support', $result['rows'][0]['section']);
        $this->assertSame('Staff/Officer', $result['rows'][0]['position']);
        $this->assertSame('EMP-1005', $result['rows'][0]['report_to']);
    }
}
