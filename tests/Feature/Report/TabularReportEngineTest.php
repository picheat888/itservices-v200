<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Vendor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * The tabular report engine end to end — definition, rows, summary, validation, access,
 * export — exercised through "สัญญาใกล้หมดอายุ" (contracts.expiring).
 */
class TabularReportEngineTest extends TestCase
{
    use RefreshDatabase;

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
    private function contract(array $attributes): Contract
    {
        $vendor = Vendor::firstOrCreate(['name' => 'Acme'], ['name_th' => 'แอคมี']);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id, 'name' => 'Contract', 'type' => 'software',
            'start_date' => '2025-10-01', 'end_date' => '2026-10-15',
            'value' => 1000, 'billing_cycle' => 'monthly',
        ], $attributes));
    }

    public function test_definition_describes_filters_and_columns(): void
    {
        $data = $this->actingAs($this->userWith(['contracts.view']))
            ->getJson('/api/reports/r/contracts.expiring')->assertOk()->json('data');

        $this->assertSame('contracts.expiring', $data['key']);
        $this->assertSame(['xlsx', 'pdf'], $data['formats']);
        $this->assertSame(['within', 'type', 'vendor_id'], array_column($data['filters'], 'name'));
        $this->assertSame(90, $data['filters'][0]['default']);
        $this->assertContains('days_left', array_column($data['columns'], 'key'));
    }

    public function test_rows_follow_the_window_and_skip_closed_contracts(): void
    {
        $soon = $this->contract(['name' => 'Soon', 'end_date' => '2026-10-15']);
        $overdue = $this->contract(['name' => 'Overdue', 'end_date' => '2026-09-20']);
        $this->contract(['name' => 'Far', 'end_date' => '2027-06-01']);
        $this->contract(['name' => 'Cancelled', 'end_date' => '2026-10-01', 'cancelled_at' => '2026-09-01 10:00']);
        $this->contract(['name' => 'Expired', 'end_date' => '2026-09-01', 'expired_at' => '2026-09-02 10:00']);

        $body = $this->actingAs($this->userWith(['contracts.view']))
            ->getJson('/api/reports/r/contracts.expiring/rows')->assertOk()->json();

        $this->assertSame([$overdue->id, $soon->id], array_column($body['data'], 'id'));
        $this->assertSame(-5, $body['data'][0]['days_left']);
        $this->assertSame(20, $body['data'][1]['days_left']);
        $this->assertSame(['name' => 'Acme', 'name_th' => 'แอคมี'], $body['data'][1]['vendor']);
        $this->assertSame(2, $body['meta']['total']);
        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(1, $summary['overdue']['value']);
        $this->assertSame(1, $summary['within_30']['value']);
    }

    public function test_filters_narrow_and_validate(): void
    {
        $user = $this->userWith(['contracts.view']);
        $this->contract(['name' => 'Hw', 'type' => 'hardware', 'end_date' => '2026-10-10']);
        $this->contract(['name' => 'Sw', 'type' => 'software', 'end_date' => '2026-12-10']);

        $this->assertSame(1, $this->actingAs($user)->getJson('/api/reports/r/contracts.expiring/rows?type=hardware')->json('meta.total'));
        $this->assertSame(1, $this->actingAs($user)->getJson('/api/reports/r/contracts.expiring/rows?within=30')->json('meta.total'));
        $this->assertSame(2, $this->actingAs($user)->getJson('/api/reports/r/contracts.expiring/rows?within=90')->json('meta.total'));
        $this->actingAs($user)->getJson('/api/reports/r/contracts.expiring/rows?within=45')
            ->assertUnprocessable()->assertJsonValidationErrors('within');
    }

    public function test_access_and_unknown_keys(): void
    {
        $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/contracts.expiring/rows')->assertForbidden();
        $this->actingAs($this->userWith(['contracts.view']))
            ->getJson('/api/reports/r/nope.nothing')->assertNotFound();
        $this->actingAs($this->userWith(['tickets.view_all', 'tickets.resolve']))
            ->getJson('/api/reports/r/tickets.overview')->assertNotFound();
    }

    public function test_definition_and_export_need_contracts_view(): void
    {
        $limited = $this->userWith(['assets.view']);

        $this->actingAs($limited)->getJson('/api/reports/r/contracts.expiring')->assertForbidden();
        $this->actingAs($limited)->get('/api/reports/r/contracts.expiring/export?format=xlsx')->assertForbidden();
    }

    public function test_xlsx_export_honours_the_current_filters(): void
    {
        Excel::fake();
        $this->contract(['name' => 'Hw', 'type' => 'hardware', 'end_date' => '2026-10-10']);
        $this->contract(['name' => 'Sw', 'type' => 'software', 'end_date' => '2026-10-10']);

        $this->actingAs($this->userWith(['contracts.view']))
            ->get('/api/reports/r/contracts.expiring/export?format=xlsx&type=hardware')->assertOk();

        Excel::assertDownloaded('Report_contracts-expiring_2026-09-25.xlsx', function (TabularReportExport $export) {
            return $export->rows->count() === 1;
        });
    }

    public function test_xlsx_export_carries_thai_headings_and_labels(): void
    {
        Excel::fake();
        $this->contract(['name' => 'Soon', 'type' => 'hardware', 'end_date' => '2026-10-15']);

        $this->actingAs($this->userWith(['contracts.view']))
            ->get('/api/reports/r/contracts.expiring/export?format=xlsx')->assertOk();

        Excel::assertDownloaded('Report_contracts-expiring_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = $export->sheets()[1];
            $row = $sheet->map($export->rows->first());

            return in_array('วันที่สิ้นสุด', $sheet->headings(), true)
                && in_array('ฮาร์ดแวร์', $row, true)
                && in_array('แอคมี', $row, true);
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $this->contract(['name' => 'Soon', 'end_date' => '2026-10-15']);

        $response = $this->actingAs($this->userWith(['contracts.view']))
            ->get('/api/reports/r/contracts.expiring/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
