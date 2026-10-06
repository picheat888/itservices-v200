<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Settings\WriteoffReason;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "การตัดจำหน่ายทรัพย์สิน" (assets.writeoffs): the assets that left the register within a date range
 * (assets.written_off_at), through /reports/r/{key}, plus its breakdown endpoint (months, reasons,
 * categories, rented assets by contract).
 */
class AssetWriteoffReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const RANGE = 'from=2026-08-01&to=2026-09-30';

    /** @var array<string, Asset> */
    private array $set = [];

    /** @var array<string, Contract> */
    private array $contracts = [];

    /** @var array<string, int> */
    private array $reasons = [];

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

    private function contract(string $code, string $endDate): Contract
    {
        return Contract::create([
            'code' => $code, 'vendor_id' => Vendor::firstOrCreate(['name' => 'Lease Vendor'])->id, 'name' => "Lease {$code}",
            'type' => 'hardware', 'start_date' => '2025-01-01', 'end_date' => $endDate, 'value' => 7200, 'billing_cycle' => 'monthly',
        ]);
    }

    /**
     * Bought, in the range (Aug–Sep 2026):
     * - aug: laptop, 3 years in service, warranty ended → expired, 3–5 y band
     * - sep_printer: printer, 2 years, warranty to Mar 2027 → under warranty (about 6 months left)
     * - sep_lifetime: printer, 7.7 years, lifetime warranty, no reason picked
     * - sep_unknown: laptop, 1.7 years, no warranty on record → unknown
     * Bought, outside it: july. Still in service: ready.
     *
     * Rented laptops on four contracts:
     * - ended (31 Aug 2026): r1 handed back 20 Aug (before the end), r2 written off lost 5 Sep, r3 still out
     * - ending_soon (30 Nov 2026): r5 out · running (30 Jun 2027): r4 out
     * - done (31 Dec 2026): r6 handed back 10 Sep
     */
    private function seedAssets(): void
    {
        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        $store = Warehouse::create(['name' => 'Main store']);
        $this->reasons = [
            'beyond_repair' => (int) WriteoffReason::where('name', 'ชำรุด ซ่อมไม่คุ้ม')->value('id'),
            'lost' => (int) WriteoffReason::where('name', 'สูญหาย / ถูกโจรกรรม')->value('id'),
        ];
        $this->contracts = [
            'ended' => $this->contract('CT-2026-901', '2026-08-31'),
            'ending_soon' => $this->contract('CT-2026-902', '2026-11-30'),
            'running' => $this->contract('CT-2026-903', '2027-06-30'),
            'done' => $this->contract('CT-2026-904', '2026-12-31'),
        ];

        $bought = fn (array $attributes) => Asset::factory()->create(array_merge([
            'status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null, 'warehouse_id' => $store->id,
            'source' => 'purchased', 'warranty_lifetime' => false,
        ], $attributes));
        $rented = function (Contract $contract, array $attributes) use ($laptops) {
            $asset = Asset::factory()->create(array_merge(['owner_employee_id' => null, 'owner' => null, 'category_id' => $laptops->id], $attributes));
            // The rented shape (no value, purchase date or warranty of its own), as AssetService stores it.
            Asset::whereKey($asset->id)->update([
                'source' => 'rented', 'contract_id' => $contract->id, 'value' => 0, 'purchase_date' => null,
                'warranty_end' => null, 'warranty_lifetime' => false,
            ]);

            return $asset->fresh();
        };

        $this->set = [
            'aug' => $bought(['category_id' => $laptops->id, 'value' => 30000, 'purchase_date' => '2023-08-10', 'warranty_end' => '2024-08-10',
                'written_off_at' => '2026-08-10 09:00:00', 'last_reason' => 'Screen broken', 'writeoff_reason_id' => $this->reasons['beyond_repair']]),
            'sep_printer' => $bought(['category_id' => $printers->id, 'value' => 12000, 'purchase_date' => '2024-09-05', 'warranty_end' => '2027-03-20',
                'written_off_at' => '2026-09-20 15:30:00', 'last_reason' => 'Beyond repair', 'writeoff_reason_id' => $this->reasons['beyond_repair']]),
            'sep_lifetime' => $bought(['category_id' => $printers->id, 'value' => 5000, 'purchase_date' => '2019-01-01', 'warranty_end' => null,
                'warranty_lifetime' => true, 'written_off_at' => '2026-09-01 09:00:00', 'writeoff_reason_id' => null]),
            'sep_unknown' => $bought(['category_id' => $laptops->id, 'value' => 8000, 'purchase_date' => '2025-01-01', 'warranty_end' => null,
                'written_off_at' => '2026-09-02 09:00:00', 'writeoff_reason_id' => $this->reasons['lost']]),
            'july' => $bought(['category_id' => $printers->id, 'value' => 9000, 'purchase_date' => '2022-01-01', 'written_off_at' => '2026-07-01 09:00:00']),
            'ready' => Asset::factory()->create(['status' => 'ready', 'category_id' => $laptops->id]),
            'r1' => $rented($this->contracts['ended'], ['status' => 'writeoff', 'written_off_at' => '2026-08-20 09:00:00',
                'returned_to_vendor_at' => '2026-08-20 09:00:00', 'writeoff_reason_id' => null, 'last_reason' => null]),
            'r2' => $rented($this->contracts['ended'], ['status' => 'writeoff', 'written_off_at' => '2026-09-05 09:00:00',
                'writeoff_reason_id' => $this->reasons['lost'], 'returned_to_vendor_at' => null]),
            'r3' => $rented($this->contracts['ended'], ['status' => 'ready']),
            'r4' => $rented($this->contracts['running'], ['status' => 'deployed']),
            'r5' => $rented($this->contracts['ending_soon'], ['status' => 'ready']),
            'r6' => $rented($this->contracts['done'], ['status' => 'writeoff', 'written_off_at' => '2026-09-10 09:00:00',
                'returned_to_vendor_at' => '2026-09-10 09:00:00', 'writeoff_reason_id' => null]),
        ];
    }

    /** @return array<string, mixed> */
    private function rows(string $query = self::RANGE): array
    {
        return $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.writeoffs/rows?'.$query)->assertOk()->json();
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = self::RANGE): array
    {
        return $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/assets/writeoffs/breakdown?'.$query)->assertOk()->json('data');
    }

    public function test_it_lists_what_left_in_the_range_newest_first(): void
    {
        $this->seedAssets();

        $body = $this->rows();
        $ids = array_column($body['data'], 'id');

        // July is outside the range; the ready and still-rented ones never left.
        $this->assertSame(array_map(fn (string $k) => $this->set[$k]->id, ['sep_printer', 'r6', 'r2', 'sep_unknown', 'sep_lifetime', 'r1', 'aug']), $ids);

        $row = collect($body['data'])->keyBy('id');
        $printer = $row[$this->set['sep_printer']->id];
        $this->assertSame('2026-09-20 15:30', $printer['written_off_at']);
        $this->assertSame('ชำรุด ซ่อมไม่คุ้ม', $printer['reason']);
        $this->assertSame('Beyond repair', $printer['reason_note']);
        $this->assertSame('written_off', $printer['outcome']);
        $this->assertNull($printer['contract']);
        $this->assertEquals(2.0, $printer['age_years']);
        // Warranty to 20 Mar 2027 on a 20 Sep 2026 write-off: about six months left.
        $this->assertSame('remaining', $printer['warranty']);
        $this->assertEquals(6, $printer['warranty_months']);
        $this->assertEquals(12000.0, $printer['value']);

        $this->assertSame('expired', $row[$this->set['aug']->id]['warranty']);
        $this->assertNull($row[$this->set['aug']->id]['warranty_months']);
        $this->assertSame('lifetime', $row[$this->set['sep_lifetime']->id]['warranty']);
        // No warranty on record is its own state, never "expired".
        $this->assertSame('unknown', $row[$this->set['sep_unknown']->id]['warranty']);

        // A rented unit: its contract, no warranty or value of its own (the page marks it "rented").
        $lost = $row[$this->set['r2']->id];
        $this->assertSame('CT-2026-901', $lost['contract']);
        $this->assertSame('/contracts?view='.$this->contracts['ended']->id, $lost['_links']['contract']);
        $this->assertSame('written_off', $lost['outcome']);
        $this->assertNull($lost['warranty']);
        $this->assertNull($lost['value']);
        $this->assertNull($lost['age_years']);
        // Handed back to the lessor: no reason, its own outcome.
        $this->assertSame('returned', $row[$this->set['r1']->id]['outcome']);
        $this->assertNull($row[$this->set['r1']->id]['reason']);
    }

    public function test_the_tiles_count_cost_service_life_warranty_and_overdue_rentals(): void
    {
        $this->seedAssets();

        $summary = collect($this->rows()['summary'])->keyBy('key');

        $this->assertSame(['wo_total', 'wo_purchase_value', 'wo_avg_life', 'wo_under_warranty', 'wo_rented_overdue'], $summary->keys()->all());
        $this->assertSame(7, $summary['wo_total']['value']);
        $this->assertSame(['purchased' => 4, 'rented' => 3], array_column($summary['wo_total']['split'], 'value', 'key'));

        // Only the bought ones' cost: 30,000 + 12,000 + 5,000 + 8,000, on average 13,750.
        $this->assertEquals(55000.0, $summary['wo_purchase_value']['value']);
        $this->assertSame(['label_key' => 'rep_n_wo_purchase', 'values' => ['n' => 4, 'avg' => 13750]], $summary['wo_purchase_value']['note']);

        // (3.0 + 2.0 + 7.7 + 1.7) / 4; the laptops served shortest (3.0 and 1.7 → 2.3).
        $this->assertSame('years', $summary['wo_avg_life']['format']);
        $this->assertEquals(3.6, $summary['wo_avg_life']['value']);
        $this->assertSame('rep_n_wo_shortest_life', $summary['wo_avg_life']['note']['label_key']);
        $this->assertEquals(2.3, $summary['wo_avg_life']['note']['values']['years']);
        $this->assertSame(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'], $summary['wo_avg_life']['note']['texts']['category']);

        // The printer still under warranty and the lifetime one: 12,000 + 5,000 worth.
        $this->assertSame(2, $summary['wo_under_warranty']['value']);
        $this->assertSame('amber', $summary['wo_under_warranty']['attention']);
        $this->assertSame(['label_key' => 'rep_n_wo_under_warranty_value', 'values' => ['value' => 17000]], $summary['wo_under_warranty']['note']);

        // r3 is still out on a contract that ended 31 Aug.
        $this->assertSame(1, $summary['wo_rented_overdue']['value']);
        $this->assertSame('red', $summary['wo_rented_overdue']['attention']);
        $this->assertSame(['label_key' => 'rep_n_wo_rented_overdue', 'texts' => ['codes' => 'CT-2026-901']], $summary['wo_rented_overdue']['note']);
    }

    public function test_the_tiles_say_so_when_nothing_is_under_warranty_or_overdue(): void
    {
        $this->seedAssets();

        // Only the August laptop (out of warranty) and r1 on the ended contract.
        $summary = collect($this->rows('from=2026-08-01&to=2026-08-31&contract_id='.$this->contracts['done']->id)['summary'])->keyBy('key');

        $this->assertSame(0, $summary['wo_total']['value']);
        $this->assertNull($summary['wo_avg_life']['value']);
        $this->assertNull($summary['wo_avg_life']['note']);
        $this->assertNull($summary['wo_purchase_value']['note']);
        $this->assertSame(['label_key' => 'rep_n_wo_under_warranty_none'], $summary['wo_under_warranty']['note']);
        $this->assertSame(0, $summary['wo_rented_overdue']['value']);
        $this->assertSame(['label_key' => 'rep_n_wo_rented_overdue_none'], $summary['wo_rented_overdue']['note']);
    }

    public function test_the_breakdown_lists_every_month_of_the_range_including_empty_ones(): void
    {
        $this->seedAssets();

        $months = $this->breakdown('from=2026-06-15&to=2026-09-30')['months'];

        $this->assertSame([
            ['month' => '2026-06', 'total' => 0, 'bought' => 0, 'returned' => 0, 'rented_other' => 0],
            ['month' => '2026-07', 'total' => 1, 'bought' => 1, 'returned' => 0, 'rented_other' => 0],
            ['month' => '2026-08', 'total' => 2, 'bought' => 1, 'returned' => 1, 'rented_other' => 0],
            ['month' => '2026-09', 'total' => 5, 'bought' => 3, 'returned' => 1, 'rented_other' => 1],
        ], $months);
    }

    public function test_the_breakdown_groups_reasons_with_returns_and_none_apart(): void
    {
        $this->seedAssets();

        $reasons = collect($this->breakdown()['reasons'])->keyBy('key');

        $beyond = 'reason:'.$this->reasons['beyond_repair'];
        $lost = 'reason:'.$this->reasons['lost'];
        $this->assertEqualsCanonicalizing([$beyond, $lost, 'returned', 'none'], $reasons->keys()->all());
        $this->assertSame(['total' => 2, 'bought' => 2, 'rented' => 0], array_intersect_key($reasons[$beyond], array_flip(['total', 'bought', 'rented'])));
        $this->assertSame('ชำรุด ซ่อมไม่คุ้ม', $reasons[$beyond]['name']);
        $this->assertSame(['total' => 2, 'bought' => 1, 'rented' => 1], array_intersect_key($reasons[$lost], array_flip(['total', 'bought', 'rented'])));
        // Handed back to the lessor carries no reason of its own.
        $this->assertSame(['key' => 'returned', 'reason_id' => null, 'name' => null, 'total' => 2, 'bought' => 0, 'rented' => 2], $reasons['returned']);
        $this->assertSame(1, $reasons['none']['total']);
        // Most first.
        $this->assertSame('none', last($this->breakdown()['reasons'])['key']);
    }

    public function test_the_breakdown_gives_each_category_its_cost_age_bands_and_warranty(): void
    {
        $this->seedAssets();

        $categories = $this->breakdown()['categories'];

        $this->assertSame(['Laptop', 'Printer'], array_column($categories, 'name'));
        [$laptop, $printer] = $categories;
        $this->assertSame(5, $laptop['total']);
        $this->assertSame([2, 3], [$laptop['bought'], $laptop['rented']]);
        $this->assertEquals(38000.0, $laptop['bought_value']);
        $this->assertEquals(2.3, $laptop['avg_age_years']);
        // 1.7 years → under 3; 3.0 years → 3–5.
        $this->assertSame(['under_3' => 1, 'from_3_to_5' => 1, 'over_5' => 0], $laptop['age_bands']);
        $this->assertSame(0, $laptop['under_warranty']);

        $this->assertEquals(4.9, $printer['avg_age_years']);
        $this->assertSame(['under_3' => 1, 'from_3_to_5' => 0, 'over_5' => 1], $printer['age_bands']);
        $this->assertSame(2, $printer['under_warranty']);
    }

    public function test_the_breakdown_flags_every_contract_all_time_most_urgent_first(): void
    {
        $this->seedAssets();

        // A January range with no write-offs at all: the contracts still count every unit.
        $contracts = $this->breakdown('from=2026-01-01&to=2026-01-31')['contracts'];

        $this->assertSame(['CT-2026-901', 'CT-2026-902', 'CT-2026-903', 'CT-2026-904'], array_column($contracts, 'code'));
        $this->assertSame(['overdue', 'ending_soon', 'running', 'all_returned'], array_column($contracts, 'flag'));

        [$ended, $soon, , $done] = $contracts;
        $this->assertSame('Lease CT-2026-901', $ended['name']);
        $this->assertSame('Lease Vendor', $ended['vendor']);
        $this->assertSame('2026-08-31', $ended['end_date']);
        // r1 back early, r2 lost (owed to the lessor, not returned), r3 still out.
        $this->assertSame(
            ['units' => 3, 'returned' => 1, 'written_off_other' => 1, 'still_out' => 1, 'days_left' => -25, 'returned_early' => 1],
            array_intersect_key($ended, array_flip(['units', 'returned', 'written_off_other', 'still_out', 'days_left', 'returned_early'])),
        );
        $this->assertSame(66, $soon['days_left']);
        $this->assertSame(['units' => 1, 'returned' => 1, 'still_out' => 0, 'returned_early' => 1], array_intersect_key($done, array_flip(['units', 'returned', 'still_out', 'returned_early'])));
    }

    public function test_the_filters_narrow_by_contract_reason_category_and_source(): void
    {
        $this->seedAssets();
        $ids = fn (string $query) => array_column($this->rows(self::RANGE.'&'.$query)['data'], 'id');

        $this->assertSame([$this->set['r2']->id, $this->set['r1']->id], $ids('contract_id='.$this->contracts['ended']->id));
        $this->assertSame([$this->set['r2']->id, $this->set['sep_unknown']->id], $ids('writeoff_reason_id='.$this->reasons['lost']));
        $this->assertSame([$this->set['sep_printer']->id, $this->set['sep_lifetime']->id], $ids('category_id='.$this->set['sep_printer']->category_id));
        $this->assertSame([$this->set['r6']->id, $this->set['r2']->id, $this->set['r1']->id], $ids('source=rented'));

        // The contract filter narrows the contract card too.
        $contracts = $this->breakdown(self::RANGE.'&contract_id='.$this->contracts['running']->id)['contracts'];
        $this->assertSame(['CT-2026-903'], array_column($contracts, 'code'));
    }

    public function test_the_definition_has_no_search_and_hides_the_detail_columns(): void
    {
        $this->seedAssets();

        $definition = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.writeoffs')->assertOk()->json('data');

        $this->assertSame(['from', 'to', 'category_id', 'source', 'contract_id', 'writeoff_reason_id'], array_column($definition['filters'], 'name'));
        $contractFilter = collect($definition['filters'])->firstWhere('name', 'contract_id');
        // Only contracts with assets attached.
        $this->assertSame(['CT-2026-901', 'CT-2026-902', 'CT-2026-903', 'CT-2026-904'], array_column($contractFilter['options'], 'label'));

        $hidden = collect($definition['columns'])->where('hidden', true)->pluck('key')->all();
        $this->assertSame(['brand', 'model', 'outcome', 'reason_note', 'written_off_by', 'serial', 'warehouse', 'purchase_date', 'warranty_months'], $hidden);
        $this->assertFalse($definition['has_charts']);
    }

    public function test_it_needs_assets_view(): void
    {
        $this->actingAs($this->userWith(['contracts.view']))->getJson('/api/reports/r/assets.writeoffs/rows')->assertForbidden();
        $this->actingAs($this->userWith(['contracts.view']))->getJson('/api/reports/assets/writeoffs/breakdown')->assertForbidden();
    }

    public function test_excel_export_carries_months_reasons_categories_and_contracts_before_the_list(): void
    {
        Excel::fake();
        $this->seedAssets();

        // The picker hid serial: the file keeps it anyway (hidden-by-default columns always go in).
        $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.writeoffs/export?format=xlsx&'.self::RANGE.'&columns[]=written_off_at&columns[]=asset_code&columns[]=contract&columns[]=warranty')
            ->assertAccepted();

        $this->assertExportStored('Report_assets-writeoffs_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();
            $rows = last($sheets);

            return $sheets[1]->title() === 'แยกตามเดือน'
                && $sheets[1]->array() === [['ส.ค. 2026', 2, 1, 1, 0], ['ก.ย. 2026', 5, 3, 1, 1]]
                && $sheets[2]->title() === 'แยกตามเหตุผล'
                && in_array(['คืนผู้ให้เช่า', 2, 0, 2], $sheets[2]->array(), true)
                && in_array(['ไม่ระบุเหตุผล', 1, 1, 0], $sheets[2]->array(), true)
                && $sheets[3]->title() === 'แยกตามหมวดหมู่'
                && $sheets[3]->array()[0] === ['แล็ปท็อป', 5, 2, 3, 38000.0, 2.3, 1, 1, 0, 0]
                && $sheets[4]->title() === 'เครื่องเช่าตามสัญญา'
                && $sheets[4]->array()[0] === ['CT-2026-901', 'Lease CT-2026-901', 'Lease Vendor', '2026-08-31', 3, 1, 1, 1, -25, 1, 'หมดสัญญาแล้ว ต้องตามคืน']
                && in_array('สัญญา', $rows->headings(), true)
                && in_array('ประกัน ณ วันที่ตัด', $rows->headings(), true)
                && in_array('Serial', $rows->headings(), true);
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $this->seedAssets();

        $response = $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.writeoffs/export?format=pdf&'.self::RANGE);

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
