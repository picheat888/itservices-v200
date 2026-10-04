<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "ภาพรวมของทรัพย์สิน" (assets.overview) and "ประวัติโอนย้ายและรับคืน"
 * (assets.transfer_history) through /reports/r/{key}.
 */
class AssetActivityReportsTest extends TestCase
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
    private function transfer(string $kind, string $at, array $attributes = []): AssetTransfer
    {
        $transfer = AssetTransfer::create(array_merge([
            'asset_id' => Asset::factory()->create()->id,
            'asset_tag' => 'INK-IT-0001', 'asset_model' => 'Latitude 5440', 'kind' => $kind,
            'from_owner' => 'Main store', 'to_owner' => 'EMP-9', 'reason' => 'New starter', 'performed_by' => 'IT Team',
        ], $attributes));
        AssetTransfer::query()->whereKey($transfer->id)->update(['created_at' => $at]);

        return $transfer;
    }

    // ── assets.overview ─────────────────────────────────────────────────────────────

    public function test_overview_department_card_counts_only_what_employees_hold(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        $nobody = Employee::create(['code' => 'EMP-2', 'first_name' => 'Nid', 'last_name' => 'Free']);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'pending_return', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'pending_acceptance', 'owner_employee_id' => $nobody->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'common', 'owner_employee_id' => null, 'owner' => 'Meeting room']);
        Asset::factory()->create(['status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null]);

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/rows')->assertOk()->json();

        // The list is every asset; the department card only what an employee holds.
        $this->assertSame(6, $body['meta']['total']);
        $department = collect($body['charts'])->firstWhere('key', 'department');
        $rows = collect($department['rows'])->keyBy(fn (array $r) => $r['label']['name']);
        $this->assertSame(['IT', 'No department'], $rows->keys()->all());
        $this->assertSame(2, $rows['IT']['total']);
        $this->assertSame(1, $rows['IT']['values']['deployed']);
        $this->assertSame(1, $rows['IT']['values']['pending_return']);
        $this->assertFalse($rows['IT']['apart']);
        // Someone with no department is still an employee: one row, apart.
        $this->assertSame(1, $rows['No department']['values']['pending_acceptance']);
        $this->assertTrue($rows['No department']['apart']);
        $this->assertSame(['deployed', 'pending_acceptance', 'pending_return'], array_column($department['views'][0]['series'], 'key'));

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(6, $summary['total']['value']);
        $this->assertSame(2, $summary['in_use']['value']);
        $this->assertSame(1, $summary['ready']['value']);
        $this->assertSame(1, $summary['pending_return']['value']);
        // Pending returns wear the Settings colour but keep the amber frame; the other tiles have none.
        $this->assertSame('amber', $summary['pending_return']['attention']);
        $this->assertNull($summary['in_use']['attention']);
    }

    public function test_overview_draws_ready_stock_by_warehouse_and_shared_use_by_location(): void
    {
        $store = Warehouse::create(['name' => 'Main store']);
        $room = Location::create(['name' => 'Meeting room 1']);
        Asset::factory()->create(['status' => 'ready', 'source' => 'purchased', 'warehouse_id' => $store->id, 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'source' => 'rented', 'warehouse_id' => $store->id, 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'source' => 'purchased', 'warehouse_id' => null, 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'common', 'source' => 'purchased', 'location_id' => $room->id, 'owner_employee_id' => null, 'owner' => 'Room']);
        // Written off in the same store: not ready stock, so not in the warehouse card.
        Asset::factory()->create(['status' => 'writeoff', 'warehouse_id' => $store->id, 'owner_employee_id' => null, 'owner' => null]);

        $charts = collect($this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/rows')->assertOk()->json('charts'))->keyBy('key');

        // How many sit in each store, in the ready colour, with each store's bought / rented share.
        $this->assertSame('places', $charts['warehouse']['type']);
        $this->assertSame('asset-ready', $charts['warehouse']['tone']);
        $this->assertSame(['purchased', 'rented'], array_column($charts['warehouse']['series'], 'key'));
        $this->assertSame('rented', $charts['warehouse']['center_key']);
        $this->assertSame('rep_chart_stores_n', $charts['warehouse']['count_key']);
        $warehouses = collect($charts['warehouse']['rows'])->keyBy(fn (array $r) => $r['label']['name']);
        $this->assertSame(3, $charts['warehouse']['total']);
        $this->assertSame(['purchased' => 1, 'rented' => 1], $warehouses['Main store']['values']);
        $this->assertSame(2, $warehouses['Main store']['total']);
        $this->assertTrue($warehouses['No warehouse']['apart']);
        // Shared use by location: the same card, counted in locations.
        $this->assertSame('places', $charts['location']['type']);
        // Each card in its status colour: shared use in the common one.
        $this->assertSame('asset-common', $charts['location']['tone']);
        $this->assertSame('rep_chart_locations_n', $charts['location']['count_key']);
        $this->assertNull($charts['location']['subtitle_key']);
        $this->assertSame(['purchased' => 1, 'rented' => 0], $charts['location']['rows'][0]['values']);

        $this->assertSame(1, $charts['location']['total']);
        $this->assertSame(['name' => 'Meeting room 1', 'name_th' => null], $charts['location']['rows'][0]['label']);
    }

    public function test_overview_lists_the_written_off_assets(): void
    {
        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $store = Warehouse::create(['name' => 'Main store']);
        $gone = Asset::factory()->create([
            'status' => 'writeoff', 'category_id' => $laptops->id, 'warehouse_id' => $store->id,
            'owner_employee_id' => null, 'owner' => null, 'last_reason' => 'Beyond repair',
        ]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);

        $writeoff = collect($this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/rows')->assertOk()->json('charts'))->firstWhere('key', 'writeoff');

        $this->assertSame('list', $writeoff['type']);
        $this->assertSame(1, $writeoff['total']);
        $this->assertSame(
            ['id' => $gone->id, 'code' => $gone->asset_code, 'label' => ['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'], 'place' => 'Main store', 'reason' => 'Beyond repair', 'at' => '2026-09-25 10:00'],
            collect($writeoff['rows'][0])->except('model')->all(),
        );
    }

    public function test_overview_draws_the_status_donut_and_the_category_card(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป', 'icon' => 'Laptop']);
        $printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $holder->id, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'pending_return', 'owner_employee_id' => $holder->id, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'common', 'owner_employee_id' => null, 'owner' => 'Meeting room', 'category_id' => $printers->id]);

        $viewer = $this->userWith(['assets.view']);
        $definition = $this->actingAs($viewer)->getJson('/api/reports/r/assets.overview')->assertOk()->json('data');
        $this->assertTrue($definition['has_charts']);
        // The register's list sits under the cards.
        $this->assertTrue($definition['shows_table']);
        // Asset categories read "หมวดหมู่" here, not the shared "หมวด" other reports use.
        $this->assertSame('rep_fl_asset_category', collect($definition['filters'])->firstWhere('name', 'category_id')['label_key']);
        $this->assertSame('rep_c_asset_category', collect($definition['columns'])->firstWhere('key', 'category')['label_key']);
        $this->assertSame('rep_fl_status', collect($definition['filters'])->firstWhere('name', 'status')['label_key']);

        $charts = collect($this->actingAs($viewer)
            ->getJson('/api/reports/r/assets.overview/rows')->assertOk()->json('charts'))->keyBy('key');
        $this->assertSame(['department', 'status', 'category', 'warehouse', 'location', 'writeoff'], $charts->keys()->all());

        $segments = collect($charts['status']['segments'])->keyBy('key');
        $this->assertSame(1, $segments['deployed']['value']);
        $this->assertSame('asset-deployed', $segments['deployed']['tone']);
        $this->assertSame(5, $charts['status']['total']);
        // Deployed 1 + common 1 of 5.
        $this->assertSame(40, $charts['status']['center']['value']);

        // As the /assets card: ready / in use (anything out of the pool) / written off, with the icon.
        $this->assertSame('buckets', $charts['category']['type']);
        $this->assertSame(['ready', 'used', 'writeoff'], array_column($charts['category']['series'], 'key'));
        $laptopRow = $charts['category']['rows'][0];
        $this->assertSame(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'], $laptopRow['label']);
        $this->assertSame('Laptop', $laptopRow['icon']);
        $this->assertSame(['ready' => 1, 'used' => 2, 'writeoff' => 1], $laptopRow['values']);
        $this->assertSame(4, $laptopRow['total']);

        // The category filter narrows every card, the category card included.
        $printersOnly = collect($this->actingAs($viewer)
            ->getJson("/api/reports/r/assets.overview/rows?category_id={$printers->id}")->json('charts'))->keyBy('key');
        $this->assertSame(1, $printersOnly['status']['total']);
        $this->assertCount(1, $printersOnly['category']['rows']);
    }

    public function test_overview_says_how_many_were_bought_and_rented(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        Asset::factory()->create(['status' => 'deployed', 'source' => 'purchased', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'deployed', 'source' => 'rented', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'source' => 'rented', 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'pending_return', 'source' => 'purchased', 'owner_employee_id' => $holder->id, 'owner' => null]);

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/rows')->assertOk()->json();

        // Every tile breaks its number down: bought, then rented.
        $split = collect($body['summary'])->mapWithKeys(fn (array $tile) => [$tile['key'] => array_column($tile['split'], 'value', 'key')]);
        $this->assertSame(['purchased' => 2, 'rented' => 2], $split['total']);
        $this->assertSame(['purchased' => 1, 'rented' => 1], $split['in_use']);
        $this->assertSame(['purchased' => 0, 'rented' => 1], $split['ready']);
        $this->assertSame(['purchased' => 1, 'rented' => 0], $split['pending_return']);
        $this->assertSame('rep_src_rented', $body['summary'][0]['split'][1]['label_key']);
        $this->assertSame('soft-orange', $body['summary'][0]['split'][0]['tone']);
        $this->assertSame('soft-pink', $body['summary'][0]['split'][1]['tone']);

        // Status tiles carry their share of the whole; the whole itself does not.
        $share = array_column($body['summary'], 'share', 'key');
        $this->assertSame(['total' => null, 'in_use' => 50, 'ready' => 25, 'pending_return' => 25], $share);

        // The department bars carry a source view beside the status one.
        $department = collect($body['charts'])->firstWhere('key', 'department');
        $this->assertSame(['status', 'source'], array_column($department['views'], 'key'));
        $this->assertSame(['purchased', 'rented'], array_column($department['views'][1]['series'], 'key'));
        $itRow = collect($department['rows'])->firstWhere('label.name', 'IT');
        $this->assertSame(2, $itRow['values']['purchased']);
        $this->assertSame(1, $itRow['values']['rented']);
        $this->assertSame(2, $itRow['values']['deployed']);

        // The source filter narrows the tiles' split as well.
        $rentedOnly = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.overview/rows?source=rented')->json('summary.0.split');
        $this->assertSame(['purchased' => 0, 'rented' => 2], array_column($rentedOnly, 'value', 'key'));
    }

    public function test_overview_export_carries_the_cards_as_sheets_before_the_list(): void
    {
        Excel::fake();
        $store = Warehouse::create(['name' => 'Main store']);
        Asset::factory()->create(['status' => 'ready', 'warehouse_id' => $store->id, 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null, 'last_reason' => 'Broken']);

        $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.overview/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_assets-overview_2026-09-25.xlsx', function (TabularReportExport $export) {
            $titles = array_map(fn ($sheet) => $sheet->title(), array_slice($export->sheets(), 1, 4));
            $warehouseRows = $export->sheets()[2]->array();

            return $titles === ['ทรัพย์สินแยกตามแผนก', 'ทรัพย์สินในคลัง (พร้อมใช้งาน)', 'ทรัพย์สินในส่วนกลาง', 'ตัดจำหน่าย']
                && $warehouseRows === [['Main store', 1, 1, 0]]
                && $export->sheets()[4]->array()[0][5] === 'Broken'
                && count($export->sheets()) === 6;
        });
    }

    public function test_reports_without_charts_send_an_empty_list(): void
    {
        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.transfer_history/rows')->assertOk()->json();

        $this->assertSame([], $body['charts']);
        $this->assertTrue($this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.transfer_history')->json('data.shows_table'));
    }

    // ── assets.transfer_history ─────────────────────────────────────────────────────

    public function test_transfer_history_lists_the_trail_newest_first_with_names(): void
    {
        Employee::create(['code' => 'EMP-9', 'first_name' => 'Somchai', 'last_name' => 'Deploy']);
        $handover = $this->transfer('handover', '2026-09-10 09:00:00');
        $return = $this->transfer('return', '2026-09-20 09:00:00', ['from_owner' => 'EMP-9', 'to_owner' => 'Main store']);
        $this->transfer('relocate', '2026-09-21 09:00:00', ['from_owner' => 'EMP-9', 'to_owner' => 'EMP-9', 'reason' => 'Desk move']);
        $this->transfer('handover', '2026-08-30 09:00:00');

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.transfer_history/rows')->assertOk()->json();

        $this->assertSame(3, $body['meta']['total']);
        $rows = collect($body['data'])->keyBy('id');
        $this->assertSame('Somchai Deploy (EMP-9)', $rows[$handover->id]['to_label']);
        $this->assertSame('Main store', $rows[$handover->id]['from_label']);
        $this->assertSame('return', $rows[$return->id]['transfer_kind']);
        $this->assertSame('2026-09-20', $rows[$return->id]['moved_at']);
        $this->assertSame($return->id, $body['data'][1]['id']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $summary['handovers']['value']);
        $this->assertSame(1, $summary['returns']['value']);
        $this->assertSame(1, $summary['relocations']['value']);

        $onlyReturns = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.transfer_history/rows?kind=return')->assertOk()->json('data');
        $this->assertSame([$return->id], array_column($onlyReturns, 'id'));
    }

    public function test_asset_activity_reports_need_assets_view(): void
    {
        $user = $this->userWith(['employees.view']);

        foreach (['assets.overview', 'assets.transfer_history'] as $key) {
            $this->actingAs($user)->getJson("/api/reports/r/{$key}/rows")->assertForbidden();
        }
    }

    public function test_xlsx_export_shows_names_and_thai_labels(): void
    {
        Excel::fake();
        Employee::create(['code' => 'EMP-9', 'first_name' => 'Somchai', 'last_name' => 'Deploy']);
        $this->transfer('handover', '2026-09-10 09:00:00');

        $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.transfer_history/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_assets-transfer_history_2026-09-25.xlsx', function (TabularReportExport $export) {
            $row = $export->sheets()[1]->map($export->rows->first());

            return in_array('ส่งมอบ', $row, true) && in_array('Somchai Deploy (EMP-9)', $row, true);
        });
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);
        $this->transfer('handover', '2026-09-10 09:00:00');
        $user = $this->userWith(['assets.view']);

        foreach (['assets.overview', 'assets.transfer_history'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/r/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
