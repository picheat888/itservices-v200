<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Exports\Report\TicketOverviewRowsSheet;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * Export of the "Ticket & SLA overview" report: the same filters and access rule as the
 * screen, delivered as an Excel workbook or a PDF.
 */
class TicketOverviewExportTest extends TestCase
{
    use RefreshDatabase;

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

        $this->actingAs($user)->get('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertOk();

        Excel::assertDownloaded('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) use ($inside) {
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

        $this->actingAs($user)->get('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertOk();

        Excel::assertDownloaded('TicketReport_2026-09-01_2026-09-30_2026-09-25.xlsx', function (TicketOverviewExport $export) {
            $row = (new TicketOverviewRowsSheet($export->rows))->map($export->rows->first());

            return $row[4] === 'ฮาร์ดแวร์' // category
                && $row[5] === 'สูง' // priority
                && $row[6] === 'กำลังดำเนินการ'; // status
        });
    }

    public function test_pdf_streams_a_pdf(): void
    {
        $user = $this->deskMember();
        Ticket::factory()->create(['category' => 'hardware', 'created_at' => '2026-09-05 08:00']);

        $response = $this->actingAs($user)->get('/api/reports/tickets/overview/export?'.self::QUERY.'&format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('TicketReport_2026-09-01_2026-09-30_2026-09-25.pdf', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_an_unknown_format_is_rejected(): void
    {
        $this->actingAs($this->deskMember())
            ->getJson('/api/reports/tickets/overview/export?'.self::QUERY.'&format=csv')
            ->assertUnprocessable()->assertJsonValidationErrors('format');
    }

    public function test_export_is_refused_without_the_desk_permissions(): void
    {
        Role::create(['key' => 'plain', 'name' => 'Plain', 'is_system' => false]);
        $user = User::factory()->create(['role' => 'plain']);

        $this->actingAs($user)->getJson('/api/reports/tickets/overview/export?'.self::QUERY.'&format=xlsx')->assertForbidden();
    }
}
