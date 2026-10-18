<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularRowsSheet;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Report\Contract\ContractOverviewReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ภาพรวมและค่าใช้จ่ายสัญญา" (contracts.overview): the list of contracts in use today, and the
 * breakdown above it — tiles, bills of the next 12 months, yearly cost by type / cycle / vendor.
 */
class ContractOverviewReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    /** @var array<string, Contract> */
    private array $c = [];

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(?array $permissions = null): User
    {
        $permissions ??= $this->reportRights('contracts');
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

    /** Live: monthly, quarterly from the 31st, yearly, one in its reminder window; open but not live: not started, overdue; closed: cancelled, expired. */
    private function seedContracts(): void
    {
        $globex = Vendor::create(['name' => 'Globex']);
        $this->c = [
            'monthly' => $this->contract(['code' => 'CT-A', 'name' => 'Monthly']),
            'quarterly' => $this->contract(['code' => 'CT-B', 'name' => 'Quarterly', 'type' => 'hardware', 'vendor_id' => $globex->id,
                'start_date' => '2026-01-31', 'end_date' => '2027-12-31', 'value' => 900, 'billing_cycle' => 'quarterly']),
            'yearly' => $this->contract(['code' => 'CT-C', 'name' => 'Yearly', 'type' => 'service',
                'start_date' => '2025-11-15', 'end_date' => '2027-11-14', 'value' => 24000, 'billing_cycle' => 'yearly']),
            'reminder' => $this->contract(['code' => 'CT-H', 'name' => 'Ending soon', 'type' => 'other', 'end_date' => '2026-10-20', 'value' => 100]),
            'future' => $this->contract(['code' => 'CT-F', 'name' => 'Not started', 'type' => 'connectivity', 'vendor_id' => $globex->id,
                'start_date' => '2026-11-01', 'end_date' => '2027-10-31', 'value' => 500]),
            'overdue' => $this->contract(['code' => 'CT-G', 'name' => 'Overdue', 'end_date' => '2026-09-01']),
            'cancelled' => $this->contract(['code' => 'CT-D', 'name' => 'Cancelled', 'value' => 99999, 'cancelled_at' => '2026-09-01 00:00:00']),
            'expired' => $this->contract(['code' => 'CT-E', 'name' => 'Expired', 'value' => 99999, 'expired_at' => '2026-09-01 00:00:00']),
        ];
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/contracts/overview/breakdown?'.$query)->assertOk()->json('data');
    }

    public function test_rows_list_live_contracts_biggest_monthly_cost_first(): void
    {
        $this->seedContracts();

        $body = $this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.overview/rows')->assertOk()->json();

        $this->assertSame(
            [$this->c['yearly']->id, $this->c['monthly']->id, $this->c['quarterly']->id, $this->c['reminder']->id],
            array_column($body['data'], 'id'),
        );
        $rows = collect($body['data'])->keyBy('id');
        $quarterly = $rows[$this->c['quarterly']->id];
        $this->assertEqualsWithDelta(300.0, $quarterly['monthly_cost'], 0.001);
        $this->assertEqualsWithDelta(3600.0, $quarterly['yearly_cost'], 0.001);
        $this->assertSame('2026-10-31', $quarterly['next_bill']);
        $this->assertEqualsWithDelta(4500.0, $quarterly['remaining'], 0.001);
        $this->assertSame('active', $quarterly['time_state']);
        $this->assertSame('reminder', $rows[$this->c['reminder']->id]['time_state']);
        $this->assertSame(25, $rows[$this->c['reminder']->id]['days_left']);
        $this->assertSame('/contracts?view='.$this->c['yearly']->id, $rows[$this->c['yearly']->id]['_links']['code']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(4, $summary['cov_active']['value']);
        $this->assertEqualsWithDelta(3400.0, $summary['monthly_total']['value'], 0.001);
        $this->assertEqualsWithDelta(40800.0, $summary['yearly_total']['value'], 0.001);
    }

    public function test_a_contract_ending_today_is_still_listed_and_has_no_bill_left(): void
    {
        $today = $this->contract(['name' => 'Ends today', 'end_date' => '2026-09-25']);

        $row = $this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.overview/rows')->assertOk()->json('data.0');

        $this->assertSame($today->id, $row['id']);
        $this->assertSame('due_today', $row['time_state']);
        $this->assertNull($row['next_bill']);
        $this->assertEqualsWithDelta(0.0, $row['remaining'], 0.001);
    }

    public function test_filters_narrow_by_type_vendor_and_cycle(): void
    {
        $this->seedContracts();
        $user = $this->userWith();
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/tabular/contracts.overview/rows?'.$query)->assertOk()->json('data'), 'id');
        $globex = Vendor::where('name', 'Globex')->value('id');

        $this->assertSame([$this->c['quarterly']->id], $ids('type=hardware'));
        $this->assertSame([$this->c['yearly']->id], $ids('billing_cycle=yearly'));
        $this->assertSame([$this->c['quarterly']->id], $ids('vendor_id='.$globex));
        $this->actingAs($user)->getJson('/api/reports/tabular/contracts.overview/rows?billing_cycle=weekly')->assertUnprocessable();

        // The breakdown follows the same filters: Globex's live quarterly plus its not-started monthly bills.
        $data = $this->breakdown('vendor_id='.$globex);
        $this->assertSame(1, $data['tiles']['active']);
        $this->assertEqualsWithDelta(8600.0, $data['tiles']['next_12'], 0.001);
        $this->assertSame(['Globex'], array_column($data['vendors'], 'name'));
    }

    public function test_breakdown_tiles(): void
    {
        $this->seedContracts();

        $tiles = $this->breakdown()['tiles'];

        $this->assertSame(4, $tiles['active']);
        $this->assertSame(1, $tiles['in_reminder']);
        $this->assertEqualsWithDelta(3400.0, $tiles['monthly'], 0.001);
        $this->assertEqualsWithDelta(40800.0, $tiles['yearly'], 0.001);
        // Every bill from today to the end of the 12th month: the 1 September ones already past are not owed any more.
        $this->assertEqualsWithDelta(35700.0, $tiles['next_12'], 0.001);
        $this->assertSame(19, $tiles['next_12_bills']);
        $this->assertLessThanOrEqual($tiles['remaining'], $tiles['next_12']);
        $this->assertEqualsWithDelta(37600.0, $tiles['remaining'], 0.001);
        $this->assertSame('2027-12-31', $tiles['longest_end']);
        $this->assertSame('แอคมี', $tiles['top_vendor']['name_th']);
        $this->assertEqualsWithDelta(37200.0, $tiles['top_vendor']['yearly'], 0.001);
        $this->assertEqualsWithDelta(91.2, $tiles['top_vendor']['share'], 0.001);
    }

    public function test_breakdown_months_follow_each_billing_cycle(): void
    {
        $this->seedContracts();

        $data = $this->breakdown();
        $months = collect($data['months'])->keyBy('month');

        $this->assertCount(12, $months);
        $this->assertSame('2026-09', $data['months'][0]['month']);
        $this->assertSame('2027-08', $data['months'][11]['month']);
        // Today is 25 September: this month still holds the bills of 1 September.
        $this->assertSame(['CT-A', 'CT-H'], collect($months['2026-09']['items'])->pluck('code')->sort()->values()->all());
        $this->assertSame(['2026-09-01'], collect($months['2026-09']['items'])->pluck('date')->unique()->values()->all());
        $this->assertSame(['CT-A', 'CT-B', 'CT-H'], collect($months['2026-10']['items'])->pluck('code')->sort()->values()->all());
        // A quarterly contract from 31 Jan bills on the last day of shorter months.
        $quarterly = collect($data['months'])->flatMap(fn (array $m) => $m['items'])->where('code', 'CT-B')->pluck('date')->all();
        $this->assertSame(['2026-10-31', '2027-01-31', '2027-04-30', '2027-07-31'], $quarterly);
        $this->assertEqualsWithDelta(25500.0, collect($months['2026-11']['items'])->sum('amount'), 0.001);
        $this->assertSame('service', collect($months['2026-11']['items'])->firstWhere('code', 'CT-C')['type']);
        $this->assertNotContains('CT-D', collect($data['months'])->flatMap(fn (array $m) => $m['items'])->pluck('code')->all());

        $this->assertSame(['CT-C', '2026-11-15'], [$data['biggest_bill']['code'], $data['biggest_bill']['date']]);
        $this->assertEqualsWithDelta(24000.0, $data['biggest_bill']['amount'], 0.001);
    }

    public function test_breakdown_splits_the_yearly_cost_by_type_cycle_and_vendor(): void
    {
        $this->seedContracts();

        $data = $this->breakdown();

        $this->assertEqualsWithDelta(40800.0, $data['yearly_total'], 0.001);
        $this->assertSame(['service', 'software', 'hardware', 'other', 'connectivity'], array_column($data['types'], 'type'));
        $this->assertSame([1, 1, 1, 1, 0], array_column($data['types'], 'contracts'));
        $this->assertEqualsWithDelta(1200.0, $data['types'][3]['yearly'], 0.001);

        $cycles = collect($data['cycles'])->keyBy('cycle');
        $this->assertSame(['monthly', 'quarterly', 'yearly'], $cycles->keys()->all());
        $this->assertSame(2, $cycles['monthly']['contracts']);
        $this->assertEqualsWithDelta(13200.0, $cycles['monthly']['yearly'], 0.001);
        $this->assertEqualsWithDelta(24000.0, $cycles['yearly']['yearly'], 0.001);

        [$acme, $globex] = $data['vendors'];
        $this->assertSame(['Acme', 3, 1], [$acme['name'], $acme['contracts'], $acme['ending_soon']]);
        $this->assertEqualsWithDelta(3100.0, $acme['monthly'], 0.001);
        $this->assertEqualsWithDelta(37200.0, $acme['yearly'], 0.001);
        $this->assertEqualsWithDelta(27100.0, $acme['remaining'], 0.001);
        $this->assertSame(['Globex', 1, 0], [$globex['name'], $globex['contracts'], $globex['ending_soon']]);
    }

    public function test_breakdown_with_no_contracts(): void
    {
        $data = $this->breakdown();

        $this->assertSame(0, $data['tiles']['active']);
        $this->assertNull($data['tiles']['top_vendor']);
        $this->assertNull($data['tiles']['longest_end']);
        $this->assertNull($data['biggest_bill']);
        $this->assertSame([], $data['vendors']);
        $this->assertCount(12, $data['months']);
    }

    public function test_needs_contracts_view(): void
    {
        $user = $this->userWith([...$this->reportRights('assets')]);
        $this->actingAs($user)->getJson('/api/reports/tabular/contracts.overview/rows')->assertForbidden();
        $this->actingAs($user)->getJson('/api/reports/contracts/overview/breakdown')->assertForbidden();
    }

    public function test_the_file_carries_the_breakdown_as_sheets(): void
    {
        $this->seedContracts();
        $report = app(ContractOverviewReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['เงินที่ต้องจ่ายตามรอบบิล', 'ค่าใช้จ่ายต่อปีตามประเภท', 'ตามรอบการเรียกเก็บ', 'ค่าใช้จ่ายตามผู้ขาย'], array_column($sections, 'title'));
        $this->assertSame(['แอคมี', 3, 3100.0, 37200.0, 91.2, 27100.0, 1], $sections[3]['rows'][0]);
    }

    public function test_money_tiles_say_how_many_contracts_have_not_started(): void
    {
        $this->seedContracts();
        $report = app(ContractOverviewReport::class);
        $filters = $report->resolveFilters([]);
        $tiles = collect($report->summary($report->query($this->userWith(), $filters), $filters))->keyBy('key');

        $this->assertSame('rep_cov_k_next12_file', $tiles['cov_next_12']->note['label_key']);
        $this->assertSame(1, $tiles['cov_next_12']->note['values']['waiting']);
        $this->assertSame(1, $tiles['cov_remaining']->note['values']['waiting']);
    }

    public function test_xlsx_export_carries_thai_headings_and_labels(): void
    {
        Excel::fake();
        $this->contract(['name' => 'Yr', 'billing_cycle' => 'yearly', 'value' => 12000]);

        $this->actingAs($this->userWith())
            ->exportReport('/api/reports/tabular/contracts.overview/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_contracts-overview_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = collect($export->sheets())->first(fn (object $s) => $s instanceof TabularRowsSheet);
            $row = $sheet->map($export->rows->first());

            return in_array('ค่าใช้จ่ายต่อเดือน', $sheet->headings(), true)
                && in_array('รอบการเรียกเก็บ', $sheet->headings(), true)
                && in_array('จ่ายครั้งถัดไป', $sheet->headings(), true)
                && in_array('รายปี', $row, true)
                && in_array('แอคมี', $row, true);
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $this->seedContracts();

        $response = $this->actingAs($this->userWith())
            ->exportReport('/api/reports/tabular/contracts.overview/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
