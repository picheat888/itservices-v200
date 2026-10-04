<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Exports\Report\TicketOverviewGlossarySheet;
use App\Exports\Report\TicketOverviewHistorySheet;
use App\Exports\Report\TicketOverviewRawSheet;
use App\Exports\Report\TicketOverviewRowsSheet;
use App\Exports\Report\TicketOverviewSummarySheet;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\Ticket\TicketUpdate;
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
            // The 90th percentile reads as a ceiling ("ไม่เกิน"), never as an average of the 90%.
            $p90 = collect($rows)->first(fn (array $r) => ($r[0] ?? null) === '90% ปิดได้ไม่เกิน (ชม.)');

            // แผนก, Ticket, ฮาร์ดแวร์ … อื่น ๆ (6 categories), ยังไม่ปิด, ทัน SLA %
            return $p90 === ['90% ปิดได้ไม่เกิน (ชม.)', 2.0]
                && $department === ['ปฏิบัติการ', 2, 2, 0, 0, 0, 0, 0, 1, 100.0]
                // ผู้รับผิดชอบ, ทั้งหมด, ปิดสำเร็จ, ยกเลิก, เวลาแก้ไขโดยเฉลี่ย, ทัน SLA % — the period only
                && $staff === ['Tech One', 1, 1, 0, 2.0, 100.0];
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

    /** The "ข้อมูลดิบ" sheet carries every field of the ticket, in words rather than codes. */
    public function test_the_raw_sheet_carries_every_ticket_field_in_words(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        $tech = User::factory()->create(['name' => 'Tech One']);
        $asset = Asset::factory()->create();
        $ticket = Ticket::factory()->create([
            'subject' => 'Printer jams',
            'description' => 'Label printer jams on every job',
            'category' => 'hardware',
            'priority' => 'high',
            'work_class' => 'repair_vendor',
            'status' => 'completed',
            'assignee_id' => $tech->id,
            'callback_phone' => '0812345678',
            'related_asset_id' => $asset->id,
            'take_note' => 'Checking the roller',
            'resolution' => 'Roller replaced',
            'created_at' => '2026-09-05 08:00',
            'responded_at' => '2026-09-05 10:00',
            'sla_response_due_at' => '2026-09-05 09:00',
            'resolved_at' => '2026-09-06 08:00',
            'sla_resolve_due_at' => '2026-09-07 08:00',
        ]);
        $ticket->updates()->create(['user_id' => $tech->id, 'author_name' => 'Tech One', 'kind' => TicketUpdate::KIND_NOTE, 'body' => 'Ordered a roller']);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) use ($asset) {
            $sheet = new TicketOverviewRawSheet($export->rows);
            $row = array_combine($sheet->headings(), $sheet->map($export->rows->first()));

            return $row['รายละเอียดปัญหา'] === 'Label printer jams on every job'
                && $row['ลักษณะงาน'] === 'งานซ่อม (ช่างภายนอก)'
                && $row['ทรัพย์สินที่เกี่ยวข้อง'] === $asset->asset_code
                && $row['เบอร์ติดต่อกลับ'] === '0812345678'
                && $row['รับเคสเมื่อ'] === '2026-09-05 10:00'
                && $row['เวลาที่ใช้รับเคส (ชม.)'] === 2.0
                && $row['ผลการรับเคสตาม SLA'] === 'เกิน SLA' // taken an hour after its response deadline
                && $row['ผลการแก้ไขตาม SLA'] === 'ทัน SLA'
                && $row['บันทึกตอนรับเคส'] === 'Checking the roller'
                && $row['ผลการดำเนินงาน'] === 'Roller replaced'
                && $row['จำนวนบันทึกความคืบหน้า'] === 1
                && $row['เลขที่คำขอ'] === null;
        });
    }

    /**
     * A case nobody has taken past its response deadline is late on response only — its
     * resolution is not judged until its own deadline passes.
     */
    public function test_the_raw_sheet_judges_response_and_resolution_each_by_its_own_deadline(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        Ticket::factory()->create([
            'category' => 'hardware',
            'created_at' => '2026-09-24 08:00',
            'sla_response_due_at' => '2026-09-24 09:00',
            'sla_resolve_due_at' => '2026-09-26 08:00',
        ]);

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) {
            $sheet = new TicketOverviewRawSheet($export->rows);
            $row = array_combine($sheet->headings(), $sheet->map($export->rows->first()));

            return $row['ผลการรับเคสตาม SLA'] === 'เกิน SLA'
                && $row['ผลการแก้ไขตาม SLA'] === null
                && $row['จำนวนบันทึกความคืบหน้า'] === 0;
        });
    }

    /**
     * The "ประวัติ" sheet tells each ticket's story in order — audit entries and progress notes
     * together, without the audit's duplicate of a note — and still opens a ticket the audit
     * log never saw opened.
     */
    public function test_the_history_sheet_lists_what_happened_on_each_ticket_in_order(): void
    {
        Excel::fake();
        $user = $this->deskMember();
        $logged = Ticket::factory()->create(['subject' => 'VPN down', 'category' => 'hardware', 'status' => 'completed', 'created_at' => '2026-09-05 08:00']);
        $quiet = Ticket::factory()->create(['subject' => 'Mouse broken', 'category' => 'hardware', 'created_at' => '2026-09-04 08:00']);

        $this->travelTo('2026-09-05 08:00');
        AuditLog::create(['user_name' => 'Somchai', 'action' => 'Created ticket', 'target' => "{$logged->ticket_no} - VPN down"]);
        $this->travelTo('2026-09-05 09:00');
        AuditLog::create(['user_name' => 'Tech One', 'action' => 'Took ticket', 'target' => "{$logged->ticket_no} → Tech One"]);
        $this->travelTo('2026-09-05 10:00');
        $logged->updates()->create(['author_name' => 'Tech One', 'kind' => TicketUpdate::KIND_NOTE, 'body' => 'Restarted the gateway']);
        AuditLog::create(['user_name' => 'Tech One', 'action' => 'Updated ticket progress', 'target' => "{$logged->ticket_no} - VPN down"]);
        $this->travelTo('2026-09-05 11:00');
        $logged->updates()->create(['author_name' => 'Tech One', 'kind' => TicketUpdate::KIND_FORWARDED, 'body' => '', 'meta' => ['from' => 'Tech One', 'to' => 'Tech Two']]);
        $this->travelTo('2026-09-05 12:00');
        AuditLog::create(['user_name' => 'Tech Two', 'action' => 'Resolved ticket', 'target' => "{$logged->ticket_no} → completed"]);
        $this->travelTo('2026-09-25 10:00');

        $this->actingAs($user)->exportReport('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertAccepted();

        $opener = $quiet->requester->name_th ?: $quiet->requester->name;
        $this->assertExportStored('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) use ($logged, $quiet, $opener) {
            $sheet = new TicketOverviewHistorySheet($export->history);
            $lines = $export->history->map(fn (array $e) => implode(' | ', $sheet->map($e)))->all();

            // Tickets in the workbook's order (the later one first), each story oldest first.
            return $lines === [
                "{$quiet->ticket_no} | 2026-09-04 08:00 | เปิด Ticket | {$opener} | Mouse broken",
                "{$logged->ticket_no} | 2026-09-05 08:00 | เปิด Ticket | Somchai | VPN down",
                "{$logged->ticket_no} | 2026-09-05 09:00 | รับเคส | Tech One | ผู้รับผิดชอบ: Tech One",
                "{$logged->ticket_no} | 2026-09-05 10:00 | บันทึกความคืบหน้า | Tech One | Restarted the gateway",
                "{$logged->ticket_no} | 2026-09-05 11:00 | ส่งต่องาน | Tech One | จาก Tech One ให้ Tech Two",
                "{$logged->ticket_no} | 2026-09-05 12:00 | ปิดเคส | Tech Two | สถานะ: เสร็จสิ้น",
            ];
        });
    }

    /** Every raw and history column is explained on the "คำอธิบายคอลัมน์" sheet. */
    public function test_the_glossary_explains_every_raw_and_history_column(): void
    {
        $explained = collect((new TicketOverviewGlossarySheet)->array())
            ->filter(fn (array $row) => $row[2] !== '')
            ->map(fn (array $row) => "{$row[0]}/{$row[1]}")
            ->all();

        foreach ([TicketOverviewRawSheet::TITLE => TicketOverviewRawSheet::columns(), TicketOverviewHistorySheet::TITLE => TicketOverviewHistorySheet::columns()] as $sheet => $columns) {
            foreach ($columns as $column) {
                $this->assertContains("{$sheet}/{$column['heading']}", $explained);
            }
        }
    }
}
