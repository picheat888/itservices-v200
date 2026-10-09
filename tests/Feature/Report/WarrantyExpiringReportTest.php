<?php

namespace Tests\Feature\Report;

use App\Models\Asset\Asset;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Report\Asset\WarrantyExpiringReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "ประกันใกล้หมดอายุ" (assets.warranty_expiring): the list under the soon / expired segments, the
 * tiles, and the breakdown endpoint (months, time-left bands, categories and vendors in periods).
 */
class WarrantyExpiringReportTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, Asset> */
    private array $set;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        $dell = Vendor::create(['name' => 'Dell', 'name_th' => 'เดลล์']);
        $hp = Vendor::create(['name' => 'HP', 'name_th' => 'เอชพี']);
        $make = fn (array $attributes) => Asset::factory()->create([
            'source' => 'purchased', 'warranty_lifetime' => false, 'owner_employee_id' => null, ...$attributes,
        ]);
        $day = fn (int $days) => today()->addDays($days)->toDateString();

        $this->set = [
            'due10' => $make(['category_id' => $laptops->id, 'vendor_id' => $dell->id, 'status' => 'ready', 'value' => 30000, 'warranty_end' => $day(10)]),
            'due10b' => $make(['category_id' => $laptops->id, 'vendor_id' => $dell->id, 'status' => 'deployed', 'value' => 20000, 'warranty_end' => $day(10)]),
            'due60' => $make(['category_id' => $printers->id, 'vendor_id' => $hp->id, 'status' => 'pending_return', 'value' => 10000, 'warranty_end' => $day(60)]),
            'due200' => $make(['category_id' => $printers->id, 'vendor_id' => $hp->id, 'status' => 'common', 'value' => 9000, 'warranty_end' => $day(200)]),
            'due400' => $make(['category_id' => $laptops->id, 'vendor_id' => null, 'status' => 'ready', 'value' => 8000, 'warranty_end' => $day(400)]),
            'gone5' => $make(['category_id' => $laptops->id, 'vendor_id' => $dell->id, 'status' => 'ready', 'value' => 5000, 'warranty_end' => $day(-5)]),
            'gone40' => $make(['category_id' => $printers->id, 'vendor_id' => $hp->id, 'status' => 'deployed', 'value' => 7000, 'warranty_end' => $day(-40)]),
            'no_date' => $make(['category_id' => $laptops->id, 'vendor_id' => $dell->id, 'status' => 'ready', 'warranty_end' => null]),
        ];
        // Never in the report: a lifetime warranty, a written-off asset, a rented one.
        $make(['category_id' => $laptops->id, 'status' => 'ready', 'warranty_end' => $day(10), 'warranty_lifetime' => true]);
        $make(['category_id' => $laptops->id, 'status' => 'writeoff', 'warranty_end' => $day(10)]);
        Asset::factory()->rented()->create(['status' => 'ready']);
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions = ['assets.view']): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<int> */
    private function ids(string ...$names): array
    {
        return array_map(fn (string $name) => $this->set[$name]->id, $names);
    }

    /** @return list<int> */
    private function rowIds(string $query = ''): array
    {
        $rows = $this->actingAs($this->userWith())->getJson('/api/reports/r/assets.warranty_expiring/rows'.$query)->assertOk()->json('data');

        return array_column($rows, 'id');
    }

    public function test_the_list_follows_the_window_the_segment_and_the_vendor(): void
    {
        $soon = $this->rowIds();
        sort($soon);
        $this->assertSame($this->ids('due10', 'due10b', 'due60'), $soon);

        // A year reaches the 200-day one, not the 400-day one.
        $this->assertCount(4, $this->rowIds('?within=365'));
        // Expired: latest first, the window set aside.
        $this->assertSame($this->ids('gone5', 'gone40'), $this->rowIds('?state=expired&within=30'));
        $this->assertEqualsCanonicalizing($this->ids('due10', 'due10b'), $this->rowIds('?vendor_id='.$this->set['due10']->vendor_id));
    }

    public function test_tiles_count_the_window_its_value_the_next_30_days_expired_and_dated(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/assets.warranty_expiring/rows')->assertOk()->json('summary'))
            ->keyBy('key');

        $within = $summary['wty_within_90d'];
        $this->assertSame(3, $within['value']);
        $this->assertSame(['ready' => 1, 'deployed' => 1, 'pending_return' => 1], array_column($within['split'], 'value', 'key'));

        $this->assertEquals(60000, $summary['wty_value']['value']);
        $this->assertSame(3, $summary['wty_value']['note']['values']['n']);

        $this->assertSame(2, $summary['wty_within_30']['value']);
        $this->assertSame(10, $summary['wty_within_30']['note']['values']['d']);
        $this->assertContains($summary['wty_within_30']['note']['texts']['code'], [$this->set['due10']->asset_code, $this->set['due10b']->asset_code]);

        $this->assertSame(2, $summary['wty_expired']['value']);
        $this->assertSame('red', $summary['wty_expired']['attention']);
        $this->assertSame('12,000.00', $summary['wty_expired']['note']['texts']['value']);
        $this->assertSame(1, $summary['wty_expired']['note']['values']['n']);

        // Seven of eight bought assets carry a date; the one without a vendor is the 400-day laptop.
        $this->assertSame(7, $summary['wty_dated']['value']);
        $this->assertSame(88, $summary['wty_dated']['share']);
        $this->assertSame(['bought' => 8, 'no_date' => 1, 'no_vendor' => 1], $summary['wty_dated']['note']['values']);

        $wide = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/assets.warranty_expiring/rows?within=365')->json('summary'))->keyBy('key');
        $this->assertSame(4, $wide['wty_within_365d']['value']);
    }

    public function test_breakdown_draws_months_bands_categories_and_vendors(): void
    {
        $data = $this->actingAs($this->userWith())->getJson('/api/reports/assets/warranty-expiring/breakdown')->assertOk()->json('data');

        $this->assertSame(90, $data['within']);
        $months = array_column($data['months'], 'total', 'month');
        $this->assertCount(12, $months);
        $this->assertSame(['2026-09' => 0, '2026-10' => 2, '2026-11' => 1], array_slice($months, 0, 3, true));
        $this->assertSame(1, $months['2027-04']);
        $this->assertSame(1, $data['months'][1]['statuses']['deployed']);

        $bands = array_column($data['bands'], 'total', 'key');
        $this->assertSame(['expired' => 2, 'd30' => 2, 'd90' => 1, 'd180' => 0, 'd365' => 1, 'later' => 1], $bands);
        $this->assertSame(1, $data['bands'][0]['statuses']['ready']);

        // Most due in the window first: laptops (2 due, both on the same day), then printers.
        [$laptops, $printers] = $data['categories'];
        $this->assertSame('แล็ปท็อป', $laptops['name_th']);
        $this->assertSame(['expired' => 1, 'within' => 2, 'mid' => 0, 'later' => 1], $laptops['periods']);
        $this->assertSame(10, $laptops['nearest']['days_left']);
        $this->assertSame(1, $laptops['more_in_window']);
        $this->assertSame(1, $laptops['more_same_day']);
        $this->assertSame(['expired' => 1, 'within' => 1, 'mid' => 1, 'later' => 0], $printers['periods']);
        $this->assertSame(['total' => 7, 'within' => 3], ['total' => $data['category_totals']['total'], 'within' => $data['category_totals']['periods']['within']]);

        // The assets with no vendor sit last.
        $this->assertSame(['Dell', 'HP', null], array_column($data['vendors'], 'name'));
        $this->assertSame(400, $data['vendors'][2]['next_days']);
        $this->assertNull($data['vendors'][2]['nearest']);

        // A year-long window leaves no middle period.
        $year = $this->actingAs($this->userWith())->getJson('/api/reports/assets/warranty-expiring/breakdown?within=365')->json('data');
        $this->assertSame(['expired' => 1, 'within' => 2, 'mid' => 0, 'later' => 1], $year['categories'][0]['periods']);
        $this->assertSame(['expired' => 1, 'within' => 2, 'mid' => 0, 'later' => 0], $year['categories'][1]['periods']);
    }

    public function test_the_file_carries_the_breakdown_as_sheets(): void
    {
        $report = app(WarrantyExpiringReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['ประกันหมดรายเดือน', 'ประกันเหลืออีกเท่าไร', 'แยกตามหมวดหมู่', 'แยกตามผู้ขาย'], array_column($sections, 'title'));
        $this->assertSame(['หมวดหมู่', 'ทั้งหมด', 'หมดแล้ว', 'ภายใน 90 วัน', '91 วัน - 1 ปี', 'เกิน 1 ปี', 'ใกล้สุด'], $sections[2]['headings']);
        $this->assertSame('ไม่ระบุผู้ขาย', $sections[3]['rows'][2][0]);
    }

    public function test_breakdown_needs_assets_view(): void
    {
        $this->actingAs($this->userWith(['contracts.view']))->getJson('/api/reports/assets/warranty-expiring/breakdown')->assertForbidden();
    }
}
