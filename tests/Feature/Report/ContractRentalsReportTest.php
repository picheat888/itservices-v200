<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Report\Contract\ContractRentalsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "สัญญาเช่าและทรัพย์สิน" (contracts.rentals): hardware contracts and their linked assets — the list, the
 * tiles, assets by status per contract, units due back, and rent against the purchase price per model.
 */
class ContractRentalsReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    /** @var array<string, Contract> */
    private array $contracts;

    /** @var array<string, Asset> */
    private array $assets;

    /** @var array<string, AssetModel> */
    private array $models;

    private Category $laptops;

    private Category $printers;

    private Vendor $beta;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $acme = Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']);
        $this->beta = Vendor::create(['name' => 'Beta', 'name_th' => 'เบต้า']);
        $this->laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $this->printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        $dell = Brand::create(['name' => 'Dell']);
        $hp = Brand::create(['name' => 'HP']);
        $this->models = [
            'lat' => AssetModel::create(['name' => 'Latitude 5440', 'brand_id' => $dell->id]),
            'laser' => AssetModel::create(['name' => 'LaserJet', 'brand_id' => $hp->id]),
            'xps' => AssetModel::create(['name' => 'XPS 13', 'brand_id' => $dell->id]),
            'opti' => AssetModel::create(['name' => 'OptiPlex', 'brand_id' => $dell->id]),
        ];

        $contract = fn (array $attributes) => Contract::create([
            'vendor_id' => $acme->id, 'name' => 'Lease', 'type' => 'hardware',
            'start_date' => '2025-10-01', 'end_date' => '2027-09-30', 'value' => 1000, 'billing_cycle' => 'monthly', ...$attributes,
        ]);
        $this->contracts = [
            'running' => $contract(['name' => 'Running lease']),
            'soon' => $contract(['name' => 'Ending lease', 'start_date' => '2025-12-01', 'end_date' => '2026-11-30', 'value' => 1800, 'billing_cycle' => 'quarterly', 'notify_90' => true]),
            'overdue' => $contract(['name' => 'Overdue lease', 'vendor_id' => $this->beta->id, 'start_date' => '2024-09-01', 'end_date' => '2026-09-01']),
            'cancelled' => $contract(['name' => 'Cancelled lease', 'cancelled_at' => '2026-08-01 00:00:00']),
            'ma' => $contract(['name' => 'Laptop MA', 'vendor_id' => $this->beta->id, 'start_date' => '2025-12-01', 'end_date' => '2026-12-01', 'value' => 12000, 'billing_cycle' => 'yearly']),
            'pricey' => $contract(['name' => 'Desktop lease', 'vendor_id' => $this->beta->id, 'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 3000]),
            'unlinked' => $contract(['name' => 'Spare pool', 'value' => 24000, 'billing_cycle' => 'yearly']),
            'unlinked_expired' => $contract(['name' => 'Old pool', 'end_date' => '2026-06-30', 'expired_at' => '2026-07-01 00:00:00']),
            'software' => $contract(['name' => 'Office 365', 'type' => 'software']),
        ];

        $asset = fn (string $contract, string $model, string $source, string $status, array $extra = []) => Asset::factory()->create([
            'contract_id' => $contract === '' ? null : $this->contracts[$contract]->id,
            'model_id' => $this->models[$model]->id,
            'brand_id' => $this->models[$model]->brand_id,
            'category_id' => $model === 'laser' ? $this->printers->id : $this->laptops->id,
            'source' => $source, 'status' => $status, 'value' => 0, 'owner' => null, 'owner_employee_id' => null, ...$extra,
        ]);
        $this->assets = [
            'run_deployed' => $asset('running', 'lat', 'rented', 'deployed'),
            'run_ready' => $asset('running', 'lat', 'rented', 'ready'),
            'run_gone' => $asset('running', 'lat', 'rented', 'writeoff'),
            'soon_deployed' => $asset('soon', 'laser', 'rented', 'deployed'),
            'soon_ready' => $asset('soon', 'laser', 'rented', 'ready'),
            'late' => $asset('overdue', 'lat', 'rented', 'pending_return'),
            'cancelled' => $asset('cancelled', 'xps', 'rented', 'deployed'),
            'ma' => $asset('ma', 'lat', 'purchased', 'deployed', ['value' => 30000]),
            'pricey' => $asset('pricey', 'opti', 'rented', 'deployed'),
            'software' => $asset('software', 'lat', 'rented', 'deployed'),
        ];
        // Bought units of the same models, not on any contract: the purchase prices to compare with.
        $asset('', 'lat', 'purchased', 'ready', ['value' => 36000]);
        $asset('', 'lat', 'purchased', 'ready', ['value' => 0]);
        $asset('', 'opti', 'purchased', 'ready', ['value' => 20000]);
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions = ['contracts.view', 'assets.view']): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<int> */
    private function assetIds(string ...$names): array
    {
        return array_map(fn (string $name) => $this->assets[$name]->id, $names);
    }

    /** @return list<int> */
    private function rowIds(string $query = ''): array
    {
        $rows = $this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.rentals/rows'.$query)->assertOk()->json('data');

        return array_column($rows, 'id');
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/contracts/rentals/breakdown'.$query)->assertOk()->json('data');
    }

    public function test_the_list_holds_assets_on_open_hardware_contracts_ending_first(): void
    {
        $ids = $this->rowIds();
        $open = $this->assetIds('late', 'soon_deployed', 'soon_ready', 'ma', 'run_deployed', 'run_gone', 'run_ready', 'pricey');
        $this->assertEqualsCanonicalizing($open, $ids);

        // Contract end date first, then the asset code.
        $keys = array_map(fn (int $id) => [Asset::find($id)->contract->end_date->toDateString(), Asset::find($id)->asset_code], $ids);
        $sorted = $keys;
        sort($sorted);
        $this->assertSame($sorted, $keys);
        $this->assertSame($this->assets['late']->id, $ids[0]);
        $this->assertSame($this->assets['pricey']->id, end($ids));

        // All contracts adds the cancelled lease; the software contract's asset never shows.
        $this->assertEqualsCanonicalizing([...$open, $this->assets['cancelled']->id], $this->rowIds('?scope=all'));
    }

    public function test_the_return_segment_keeps_rented_units_still_out_on_contracts_ending_within_90_days_or_ended(): void
    {
        $this->assertEqualsCanonicalizing($this->assetIds('late', 'soon_deployed', 'soon_ready'), $this->rowIds('?list=return'));
        $this->assertEqualsCanonicalizing($this->assetIds('late', 'soon_deployed', 'soon_ready', 'cancelled'), $this->rowIds('?list=return&scope=all'));
    }

    public function test_filters_narrow_by_vendor_and_category(): void
    {
        $this->assertEqualsCanonicalizing($this->assetIds('late', 'ma', 'pricey'), $this->rowIds('?vendor_id='.$this->beta->id));
        $this->assertEqualsCanonicalizing($this->assetIds('soon_deployed', 'soon_ready'), $this->rowIds('?category_id='.$this->printers->id));

        $data = $this->breakdown('?category_id='.$this->printers->id);
        $this->assertSame([$this->contracts['soon']->code], array_column($data['contracts'], 'code'));
        $this->assertSame(['total' => 1, 'rent' => 1, 'buy' => 0, 'none' => 0], $data['tiles']['contracts']);
    }

    public function test_the_average_rent_per_unit_matches_the_contract_rows_under_a_category_filter(): void
    {
        // One lease of a laptop and a printer: 2,000 a month is 1,000 per unit, whatever the filter.
        $mixed = Contract::create([
            'vendor_id' => $this->beta->id, 'name' => 'Mixed lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 2000, 'billing_cycle' => 'monthly',
        ]);
        foreach ([[$this->laptops, 'lat'], [$this->printers, 'laser']] as [$category, $model]) {
            Asset::factory()->create([
                'contract_id' => $mixed->id, 'model_id' => $this->models[$model]->id, 'brand_id' => $this->models[$model]->brand_id,
                'category_id' => $category->id, 'source' => 'rented', 'status' => 'deployed', 'value' => 0, 'owner' => null, 'owner_employee_id' => null,
            ]);
        }

        $data = $this->breakdown('?category_id='.$this->printers->id);

        $row = collect($data['contracts'])->firstWhere('id', $mixed->id);
        $this->assertEquals(1000, $row['per_unit']);
        // Printers: two on the ending lease at 300 each, one here at 1,000.
        $this->assertEquals(round((300 * 2 + 1000) / 3, 2), $data['tiles']['avg_per_unit']);
    }

    public function test_a_row_carries_the_contract_its_state_and_time_left(): void
    {
        $rows = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.rentals/rows?scope=all')->assertOk()->json('data'))->keyBy('id');

        $late = $rows[$this->assets['late']->id];
        $this->assertSame($this->contracts['overdue']->code, $late['contract_code']);
        $this->assertSame('/contracts?view='.$this->contracts['overdue']->id, $late['_links']['contract_code']);
        $this->assertSame('/assets?view='.$this->assets['late']->id, $late['_links']['asset_code']);
        $this->assertSame('overdue', $late['contract_state']);
        $this->assertSame(-24, $late['days_left']);
        $this->assertSame('rented', $late['source']);
        $this->assertSame('pending_return', $late['status']);

        $this->assertSame('reminder', $rows[$this->assets['soon_ready']->id]['contract_state']);
        $this->assertSame('cancelled', $rows[$this->assets['cancelled']->id]['contract_state']);
        $this->assertNull($rows[$this->assets['cancelled']->id]['days_left']);
    }

    public function test_tiles_count_contracts_units_in_use_due_back_and_unlinked(): void
    {
        $tiles = $this->breakdown()['tiles'];

        // Software contracts and closed ones stay out; the overdue one is still open.
        $this->assertSame(['total' => 6, 'rent' => 4, 'buy' => 1, 'none' => 1], $tiles['contracts']);
        // Running rentals: two on the running lease (the written-off one aside), two ending soon, one desktop.
        $this->assertSame(5, $tiles['rented_in_use']);
        $this->assertEquals(920, $tiles['avg_per_unit']);
        $this->assertSame(2, $tiles['due_soon']);
        $this->assertSame(1, $tiles['due_soon_held']);
        $this->assertSame(1, $tiles['due_soon_ready']);
        $this->assertSame(1, $tiles['ended_out']);
        $this->assertSame(1, $tiles['ended_out_contracts']);
        $this->assertSame(1, $tiles['unlinked']);
        $this->assertEquals(24000, $tiles['unlinked_yearly']);

        $all = $this->breakdown('?scope=all')['tiles'];
        $this->assertSame(['total' => 8, 'rent' => 5, 'buy' => 1, 'none' => 2], $all['contracts']);
        // A cancelled lease still holding a unit counts as ended and not returned; a closed unlinked one adds no yearly cost.
        $this->assertSame(2, $all['ended_out']);
        $this->assertSame(2, $all['ended_out_contracts']);
        $this->assertEquals(24000, $all['unlinked_yearly']);
    }

    public function test_contracts_come_by_what_needs_action_with_assets_by_status_and_unlinked_last(): void
    {
        $contracts = $this->breakdown()['contracts'];

        $this->assertSame(
            array_map(fn (string $k) => $this->contracts[$k]->code, ['overdue', 'soon', 'ma', 'running', 'pricey', 'unlinked']),
            array_column($contracts, 'code'),
        );
        $running = $contracts[3];
        $this->assertSame('rent', $running['kind']);
        $this->assertSame(3, $running['units']);
        $this->assertSame(['ready' => 1, 'deployed' => 1, 'common' => 0, 'pending_acceptance' => 0, 'pending_return' => 0, 'writeoff' => 1], $running['statuses']);
        // 1,000 a month over the two units not written off.
        $this->assertEquals(500, $running['per_unit']);
        $this->assertSame('buy', $contracts[2]['kind']);
        $this->assertEquals(1000, $contracts[2]['per_unit']);
        $this->assertSame('reminder', $contracts[1]['state']);
        $this->assertEquals(300, $contracts[1]['per_unit']);
        $this->assertSame('none', $contracts[5]['kind']);
        $this->assertNull($contracts[5]['per_unit']);
        $this->assertEquals(24000, $contracts[5]['yearly']);
    }

    public function test_rent_is_set_against_the_purchase_price_per_model(): void
    {
        $models = collect($this->breakdown()['models'])->keyBy('name');

        $this->assertSame(['OptiPlex', 'Latitude 5440', 'LaserJet'], $models->keys()->all());

        // 3,000 a month for 24 months against one bought at 20,000.
        $opti = $models['OptiPlex'];
        $this->assertSame(1, $opti['units']);
        $this->assertEquals(3000, $opti['per_unit']);
        $this->assertEquals(24, $opti['term_months']);
        $this->assertEquals(72000, $opti['rent_total']);
        $this->assertEquals(20000, $opti['avg_buy']);
        $this->assertEquals(6.7, $opti['break_even_months']);

        // 500 a unit for 24 months against the bought ones with a price (30,000 and 36,000; the zero left out).
        $lat = $models['Latitude 5440'];
        $this->assertSame(2, $lat['units']);
        $this->assertSame(1, $lat['contracts']);
        $this->assertEquals(500, $lat['per_unit']);
        $this->assertEquals(12000, $lat['rent_total']);
        $this->assertEquals(33000, $lat['avg_buy']);
        $this->assertSame(2, $lat['bought']);
        $this->assertEquals(66, $lat['break_even_months']);
        $this->assertSame('Laptop', $lat['category']['name']);

        // Nothing bought to compare with: no price, no break-even.
        $laser = $models['LaserJet'];
        $this->assertEquals(300, $laser['per_unit']);
        $this->assertEquals(12, $laser['term_months']);
        $this->assertNull($laser['avg_buy']);
        $this->assertNull($laser['break_even_months']);
        $this->assertSame(0, $laser['bought']);
    }

    /** On a contract that leases some units and services bought ones, the rent is shared by the rented units only. */
    public function test_rent_per_unit_counts_rented_units_only_on_a_mixed_contract(): void
    {
        $mixed = Contract::create([
            'vendor_id' => $this->beta->id, 'name' => 'Mixed lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 10000, 'billing_cycle' => 'monthly',
        ]);
        foreach (['rented', 'rented', 'purchased', 'purchased'] as $source) {
            Asset::factory()->create([
                'contract_id' => $mixed->id, 'model_id' => $this->models['opti']->id, 'brand_id' => $this->models['opti']->brand_id,
                'category_id' => $this->laptops->id, 'source' => $source, 'status' => 'deployed', 'value' => 0, 'owner' => null, 'owner_employee_id' => null,
            ]);
        }

        $row = collect($this->breakdown()['contracts'])->firstWhere('id', $mixed->id);

        $this->assertSame('rent', $row['kind']);
        $this->assertEquals(5000, $row['per_unit']);
    }

    public function test_no_hardware_contracts_draws_empty_cards(): void
    {
        Asset::query()->delete();
        Contract::query()->delete();

        $data = $this->breakdown();
        $this->assertSame(['total' => 0, 'rent' => 0, 'buy' => 0, 'none' => 0], $data['tiles']['contracts']);
        $this->assertNull($data['tiles']['avg_per_unit']);
        $this->assertSame([], $data['contracts']);
        $this->assertSame([], $data['models']);
        $this->assertSame([], $this->rowIds());
    }

    public function test_needs_contracts_view(): void
    {
        $viewer = $this->userWith(['assets.view']);
        $this->actingAs($viewer)->getJson('/api/reports/tabular/contracts.rentals/rows')->assertForbidden();
        $this->actingAs($viewer)->getJson('/api/reports/contracts/rentals/breakdown')->assertForbidden();
    }

    /** The rows name who holds each unit and their department, which is asset data: contracts.view alone is not enough. */
    public function test_needs_assets_view_too(): void
    {
        $viewer = $this->userWith(['contracts.view']);
        $this->actingAs($viewer)->getJson('/api/reports/tabular/contracts.rentals/rows')->assertForbidden();
        $this->actingAs($viewer)->getJson('/api/reports/contracts/rentals/breakdown')->assertForbidden();
    }

    public function test_the_file_carries_the_cards_as_sheets(): void
    {
        $report = app(ContractRentalsReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['สถานะเครื่องตามสัญญา', 'ค่าเช่าเทียบราคาซื้อ'], array_column($sections, 'title'));
        $this->assertSame([$this->contracts['overdue']->code, 'Overdue lease', 'เบต้า', 'เช่า', 1, 0, 0, 0, 0, 1, 0], array_slice($sections[0]['rows'][0], 0, 11));
        $this->assertSame('ไม่ผูกเครื่อง', $sections[0]['rows'][5][3]);
        $this->assertSame(['Dell', 'OptiPlex', 'แล็ปท็อป', 1, 1], array_slice($sections[1]['rows'][0], 0, 5));
    }

    public function test_xlsx_export_carries_thai_headings_and_labels(): void
    {
        Excel::fake();

        $this->actingAs($this->userWith())
            ->exportReport('/api/reports/tabular/contracts.rentals/export?format=xlsx&list=return')->assertAccepted();

        $this->assertExportStored('Report_contracts-rentals_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();
            $rows = end($sheets);
            $line = $rows->map($export->rows->first());

            return $export->rows->count() === 3
                && in_array('สถานะสัญญา', $rows->headings(), true)
                && in_array('เช่า', $line, true)
                && in_array('เกินกำหนด', $line, true);
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $response = $this->actingAs($this->userWith())->exportReport('/api/reports/tabular/contracts.rentals/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
