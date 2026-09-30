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
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "ค่าใช้จ่ายสัญญารายเดือน" (contracts.monthly_cost) through the generic /reports/r/{key}
 * endpoints: contracts in effect today, each fee spread to a month and a year.
 */
class ContractMonthlyCostReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

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
            'start_date' => '2026-01-01', 'end_date' => '2026-12-31',
            'value' => 1000, 'billing_cycle' => 'monthly',
        ], $attributes));
    }

    public function test_rows_spread_each_fee_to_a_month_biggest_first(): void
    {
        $monthly = $this->contract(['name' => 'Monthly', 'value' => 1000, 'billing_cycle' => 'monthly']);
        $quarterly = $this->contract(['name' => 'Quarterly', 'value' => 900, 'billing_cycle' => 'quarterly']);
        $yearly = $this->contract(['name' => 'Yearly', 'value' => 24000, 'billing_cycle' => 'yearly']);
        $this->contract(['name' => 'Cancelled', 'cancelled_at' => '2026-09-01 00:00:00']);
        $this->contract(['name' => 'Ended', 'end_date' => '2026-09-01']);
        $this->contract(['name' => 'Not started', 'start_date' => '2026-10-01']);

        $body = $this->actingAs($this->userWith(['contracts.view']))
            ->getJson('/api/reports/r/contracts.monthly_cost/rows')->assertOk()->json();

        $this->assertSame([$yearly->id, $monthly->id, $quarterly->id], array_column($body['data'], 'id'));
        $rows = collect($body['data'])->keyBy('id');
        $this->assertEqualsWithDelta(2000.0, $rows[$yearly->id]['monthly_cost'], 0.001);
        $this->assertEqualsWithDelta(24000.0, $rows[$yearly->id]['yearly_cost'], 0.001);
        $this->assertEqualsWithDelta(300.0, $rows[$quarterly->id]['monthly_cost'], 0.001);
        $this->assertSame('quarterly', $rows[$quarterly->id]['billing_cycle']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(3, $summary['total']['value']);
        $this->assertEqualsWithDelta(3300.0, $summary['monthly_total']['value'], 0.001);
        $this->assertEqualsWithDelta(39600.0, $summary['yearly_total']['value'], 0.001);
    }

    public function test_filters_narrow_by_type_vendor_and_cycle(): void
    {
        $user = $this->userWith(['contracts.view']);
        $other = Vendor::create(['name' => 'Globex']);
        $hardware = $this->contract(['name' => 'Hw', 'type' => 'hardware']);
        $yearly = $this->contract(['name' => 'Yr', 'billing_cycle' => 'yearly', 'value' => 12000]);
        $globex = $this->contract(['name' => 'Gx', 'vendor_id' => $other->id]);

        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/contracts.monthly_cost/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$hardware->id], $ids('type=hardware'));
        $this->assertSame([$yearly->id], $ids('billing_cycle=yearly'));
        $this->assertSame([$globex->id], $ids('vendor_id='.$other->id));
        $this->actingAs($user)->getJson('/api/reports/r/contracts.monthly_cost/rows?billing_cycle=weekly')->assertUnprocessable();
    }

    public function test_needs_contracts_view(): void
    {
        $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/contracts.monthly_cost/rows')->assertForbidden();
    }

    public function test_xlsx_export_carries_thai_headings_and_labels(): void
    {
        Excel::fake();
        $this->contract(['name' => 'Yr', 'billing_cycle' => 'yearly', 'value' => 12000]);

        $this->actingAs($this->userWith(['contracts.view']))
            ->exportReport('/api/reports/r/contracts.monthly_cost/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_contracts-monthly_cost_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = $export->sheets()[1];
            $row = $sheet->map($export->rows->first());

            return in_array('ต่อเดือน', $sheet->headings(), true)
                && in_array('รายปี', $row, true)
                && in_array('แอคมี', $row, true);
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $this->contract([]);

        $response = $this->actingAs($this->userWith(['contracts.view']))
            ->exportReport('/api/reports/r/contracts.monthly_cost/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
