<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "การตัดจำหน่ายทรัพย์สิน" (assets.writeoffs): the assets written off within a date range
 * (assets.written_off_at), through /reports/r/{key}.
 */
class AssetWriteoffReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const RANGE = 'from=2026-08-01&to=2026-09-30';

    /** @var array<string, Asset> */
    private array $set = [];

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

    /**
     * Written off in August (laptop, bought 3 years before), September (two: a laptop rented, a
     * printer bought), and July — outside the range — plus one still ready.
     */
    private function seedAssets(): void
    {
        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        $store = Warehouse::create(['name' => 'Main store']);
        $writeoff = fn (array $attributes) => Asset::factory()->create(array_merge([
            'status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null, 'warehouse_id' => $store->id,
        ], $attributes));

        $this->set = [
            'aug' => $writeoff(['category_id' => $laptops->id, 'source' => 'purchased', 'value' => 30000, 'purchase_date' => '2023-08-10',
                'written_off_at' => '2026-08-10 09:00:00', 'last_reason' => 'Screen broken']),
            'sep_rented' => $writeoff(['category_id' => $laptops->id, 'written_off_at' => '2026-09-05 09:00:00', 'last_reason' => 'Lease ended']),
            'sep_printer' => $writeoff(['category_id' => $printers->id, 'source' => 'purchased', 'value' => 12000, 'purchase_date' => '2024-09-05',
                'written_off_at' => '2026-09-20 15:30:00', 'last_reason' => 'Beyond repair']),
            'july' => $writeoff(['category_id' => $printers->id, 'source' => 'purchased', 'value' => 9000, 'written_off_at' => '2026-07-01 09:00:00']),
            'ready' => Asset::factory()->create(['status' => 'ready', 'category_id' => $laptops->id]),
        ];
        Asset::whereKey($this->set['sep_rented']->id)->update(['source' => 'rented']);
    }

    public function test_it_lists_the_write_offs_in_the_range_newest_first(): void
    {
        $this->seedAssets();

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.writeoffs/rows?'.self::RANGE)->assertOk()->json();

        // July is outside the range, the ready asset is not written off.
        $this->assertSame(
            [$this->set['sep_printer']->id, $this->set['sep_rented']->id, $this->set['aug']->id],
            array_column($body['data'], 'id'),
        );
        $printer = $body['data'][0];
        $this->assertSame('2026-09-20 15:30', $printer['written_off_at']);
        $this->assertSame('Beyond repair', $printer['reason']);
        $this->assertSame('Main store', $printer['warehouse']);
        // Bought 2024-09-05, written off 2026-09-20: two years in service.
        $this->assertEquals(2.0, $printer['age_years']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(3, $summary['wo_total']['value']);
        $this->assertSame(['purchased' => 2, 'rented' => 1], array_column($summary['wo_total']['split'], 'value', 'key'));
        // Only the bought ones' cost: 30,000 + 12,000.
        $this->assertEquals(42000.0, $summary['wo_purchase_value']['value']);
        $this->assertSame('money', $summary['wo_purchase_value']['format']);
    }

    public function test_it_charts_the_write_offs_by_month_and_by_category(): void
    {
        $this->seedAssets();

        $charts = collect($this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.writeoffs/rows?'.self::RANGE)->assertOk()->json('charts'))->keyBy('key');

        // Oldest month first, each split by source.
        $months = $charts['month']['rows'];
        $this->assertSame([['name' => 'Aug 2026', 'name_th' => 'ส.ค. 2026'], ['name' => 'Sep 2026', 'name_th' => 'ก.ย. 2026']], array_column($months, 'label'));
        $this->assertSame([['purchased' => 1, 'rented' => 0], ['purchased' => 1, 'rented' => 1]], array_column($months, 'values'));

        // Largest category first.
        $categories = $charts['category']['rows'];
        $this->assertSame(['Laptop', 'Printer'], array_column(array_column($categories, 'label'), 'name'));
        $this->assertSame([2, 1], array_column($categories, 'total'));
    }

    public function test_the_filters_narrow_by_category_source_and_search(): void
    {
        $this->seedAssets();
        $user = $this->userWith(['assets.view']);
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/assets.writeoffs/rows?'.self::RANGE.'&'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$this->set['sep_printer']->id], $ids('category_id='.$this->set['sep_printer']->category_id));
        $this->assertSame([$this->set['sep_rented']->id], $ids('source=rented'));
        $this->assertSame([$this->set['aug']->id], $ids('search=Screen'));
    }

    public function test_it_needs_assets_view(): void
    {
        $this->actingAs($this->userWith(['contracts.view']))->getJson('/api/reports/r/assets.writeoffs/rows')->assertForbidden();
    }

    public function test_excel_export_carries_the_month_and_category_sheets_before_the_list(): void
    {
        Excel::fake();
        $this->seedAssets();

        $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.writeoffs/export?format=xlsx&'.self::RANGE)->assertAccepted();

        $this->assertExportStored('Report_assets-writeoffs_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();

            return $sheets[1]->title() === 'แยกตามเดือน'
                && $sheets[1]->array() === [['ส.ค. 2026', 1, 1, 0], ['ก.ย. 2026', 2, 1, 1]]
                && $sheets[2]->title() === 'แยกตามหมวดหมู่'
                && $sheets[2]->array() === [['แล็ปท็อป', 2, 1, 1], ['เครื่องพิมพ์', 1, 1, 0]]
                && last($sheets)->headings()[0] === 'วันที่ตัดจำหน่าย';
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
