<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Exports\Report\TicketOverviewRowsSheet;
use App\Exports\Report\TicketOverviewSummarySheet;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * Export of the "Ticket & SLA overview" report: the same filters and access rule as the
 * screen, delivered as an Excel workbook or a PDF.
 */
class TicketOverviewExportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const QUERY = 'from=2026-09-01&to=2026-09-30';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    private function deskMember(): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach (['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_xlsx_downloads_a_workbook_with_the_filtered_rows(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        $inside = Ticket::factory()->create(['category' => 'hardware', 'created_at' => '2026-09-05 08:00']);
        Ticket::factory()->create(['category' => 'hardware', 'created_at' => '2026-08-05 08:00']);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) use ($inside) {
            return $export->rows->pluck('id')->all() === [$inside->id]
                && $export->summary['kpi']['total'] === 1;
        });
    }

    public function test_the_workbook_translates_enum_values_to_thai_under_the_thai_headings(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        Ticket::factory()->create([
            'category' => 'hardware',
            'priority' => 'high',
            'status' => 'in_progress',
            'created_at' => '2026-09-05 08:00',
        ]);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) {
            $row = (new TicketOverviewRowsSheet($export->rows))->map($export->rows->first());

            return $row[4] === 'ฮาร์ดแวร์' // category
                && $row[5] === 'สูง' // priority
                && $row[6] === 'กำลังดำเนินการ'; // status
        });
    }

    /** The "สรุป" sheet carries the page's department-by-category and staff cards in full. */
    public function test_the_summary_sheet_lists_departments_by_category_and_every_staff_member(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        $ops = Department::create(['name' => 'Operations', 'name_th' => 'ปฏิบัติการ']);
        $worker = Employee::create(['first_name' => 'W', 'department_id' => $ops->id]);
        $tech = User::factory()->create(['name' => 'Tech One']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'completed', 'requester_id' => $worker->id, 'assignee_id' => $tech->id,
            'created_at' => '2026-09-05 08:00', 'resolved_at' => '2026-09-05 10:00', 'sla_resolve_due_at' => '2026-09-06 08:00']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'in_progress', 'requester_id' => $worker->id, 'assignee_id' => $tech->id,
            'created_at' => '2026-09-06 08:00']);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) {
            $rows = (new TicketOverviewSummarySheet($export->summary))->array();
            $department = collect($rows)->first(fn (array $r) => ($r[0] ?? null) === 'ปฏิบัติการ');
            $staff = collect($rows)->first(fn (array $r) => ($r[0] ?? null) === 'Tech One');

            // แผนก, Ticket, ฮาร์ดแวร์ … อื่น ๆ (6 categories), ยังไม่ปิด, ทัน SLA %
            return $department === ['ปฏิบัติการ', 2, 2, 0, 0, 0, 0, 0, 1, 100.0]
                // ผู้รับผิดชอบ, ปิดสำเร็จ, ยกเลิก, เวลาแก้ไขโดยเฉลี่ย, ทัน SLA % — the period only
                && $staff === ['Tech One', 1, 0, 2.0, 100.0];
        });
    }

    public function test_pdf_renders_the_department_and_staff_tables(): void
    {
        $user = $this->deskMember();
        $tech = User::factory()->create(['name' => 'Tech One']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'completed', 'assignee_id' => $tech->id,
            'created_at' => '2026-09-05 08:00', 'resolved_at' => '2026-09-05 10:00']);

        $response = $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    /** The workbook is Thai throughout — the requester too, when the record has a Thai name. */
    public function test_the_workbook_names_the_requester_in_thai_when_there_is_one(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        $thai = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        $english = Employee::create(['first_name' => 'John', 'last_name' => 'Smith']);
        Ticket::factory()->create(['category' => 'hardware', 'requester_id' => $thai->id, 'created_at' => '2026-09-05 08:00']);
        Ticket::factory()->create(['category' => 'hardware', 'requester_id' => $english->id, 'created_at' => '2026-09-06 08:00']);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) {
            $sheet = new TicketOverviewRowsSheet($export->rows);
            $names = $export->rows->map(fn ($t) => $sheet->map($t)[2])->sort()->values()->all();

            return $names === ['John Smith', 'สมชาย ใจดี'];
        });
    }

    public function test_pdf_streams_a_pdf(): void
    {
        $user = $this->deskMember();
        Ticket::factory()->create(['category' => 'hardware', 'created_at' => '2026-09-05 08:00']);

        $response = $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('TicketReport_2026-09-01_2026-09-30_2026-09-25.pdf', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_an_unknown_format_is_rejected(): void
    {
        $this->actingAs($this->deskMember())
            ->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=csv')
            ->assertUnprocessable()->assertJsonValidationErrors('format');
    }

    public function test_export_is_refused_without_the_desk_permissions(): void
    {
        Role::create(['key' => 'plain', 'name' => 'Plain', 'is_system' => false]);
        $user = User::factory()->create(['role' => 'plain']);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertForbidden();
    }
}
