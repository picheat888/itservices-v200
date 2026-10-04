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
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "ทรัพย์สินตามสถานะ และแผนก" (assets.by_status_department) and "ประวัติโอนย้ายและรับคืน"
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

    // ── assets.by_status_department ─────────────────────────────────────────────────

    public function test_by_status_department_counts_each_status_per_holder_department(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'pending_return', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'common', 'owner_employee_id' => null, 'owner' => 'Meeting room']);

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.by_status_department/rows')->assertOk()->json();

        $rows = collect($body['data'])->keyBy(fn (array $r) => $r['department']['name']);
        $this->assertSame(['Store · common · no department', 'IT'], $rows->keys()->all());
        $this->assertEquals(3, $rows['Store · common · no department']['total_count']);
        $this->assertEquals(2, $rows['Store · common · no department']['st_ready']);
        $this->assertEquals(1, $rows['Store · common · no department']['st_common']);
        $this->assertEquals(1, $rows['IT']['st_deployed']);
        $this->assertEquals(1, $rows['IT']['st_pending_return']);
        $this->assertSame('ไอที', $rows['IT']['department']['name_th']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(5, $summary['total']['value']);
        $this->assertSame(2, $summary['in_use']['value']);
        $this->assertSame(2, $summary['ready']['value']);
        $this->assertSame(1, $summary['pending_return']['value']);
        // Pending returns wear the Settings colour but keep the amber frame; the other tiles have none.
        $this->assertSame('amber', $summary['pending_return']['attention']);
        $this->assertNull($summary['in_use']['attention']);
    }

    public function test_by_status_department_draws_department_status_and_category_charts(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        $laptops = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $printers = Category::create(['name' => 'Printer', 'name_th' => 'เครื่องพิมพ์']);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $holder->id, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $holder->id, 'owner' => null, 'category_id' => $laptops->id]);
        Asset::factory()->create(['status' => 'common', 'owner_employee_id' => null, 'owner' => 'Meeting room', 'category_id' => $printers->id]);
        Asset::factory()->create(['status' => 'writeoff', 'owner_employee_id' => null, 'owner' => null, 'category_id' => $laptops->id]);

        $viewer = $this->userWith(['assets.view']);
        $definition = $this->actingAs($viewer)->getJson('/api/reports/r/assets.by_status_department')->assertOk()->json('data');
        $this->assertTrue($definition['has_charts']);
        // The department bars stand in for the table on screen.
        $this->assertFalse($definition['shows_table']);

        $charts = collect($this->actingAs($viewer)
            ->getJson('/api/reports/r/assets.by_status_department/rows')->assertOk()->json('charts'))->keyBy('key');
        $this->assertSame(['department', 'status', 'category'], $charts->keys()->all());

        $departments = collect($charts['department']['rows'])->keyBy(fn (array $r) => $r['label']['name']);
        $this->assertSame(2, $departments['IT']['values']['deployed']);
        $this->assertSame(2, $departments['IT']['total']);
        $this->assertSame(1, $departments['Store · common · no department']['values']['common']);
        $this->assertSame(1, $departments['Store · common · no department']['values']['writeoff']);
        // Assets in no department are kept apart from the departments.
        $this->assertTrue($departments['Store · common · no department']['apart']);
        $this->assertFalse($departments['IT']['apart']);

        $this->assertSame(['status', 'source'], array_column($charts['department']['views'], 'key'));

        $segments = collect($charts['status']['segments'])->keyBy('key');
        $this->assertSame(2, $segments['deployed']['value']);
        $this->assertSame('asset-deployed', $segments['deployed']['tone']);
        $this->assertSame(4, $charts['status']['total']);
        // Deployed 2 + common 1 of 4.
        $this->assertSame(75, $charts['status']['center']['value']);

        $this->assertSame([['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'], 3], [$charts['category']['rows'][0]['label'], $charts['category']['rows'][0]['value']]);

        // The category filter narrows every chart, the category bars included.
        $printersOnly = collect($this->actingAs($viewer)
            ->getJson("/api/reports/r/assets.by_status_department/rows?category_id={$printers->id}")->json('charts'))->keyBy('key');
        $this->assertSame(1, $printersOnly['status']['total']);
        $this->assertCount(1, $printersOnly['category']['rows']);
    }

    public function test_by_status_department_says_how_many_were_bought_and_rented(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $holder = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        Asset::factory()->create(['status' => 'deployed', 'source' => 'purchased', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'deployed', 'source' => 'rented', 'owner_employee_id' => $holder->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'source' => 'rented', 'owner_employee_id' => null, 'owner' => null]);
        Asset::factory()->create(['status' => 'pending_return', 'source' => 'purchased', 'owner_employee_id' => $holder->id, 'owner' => null]);

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.by_status_department/rows')->assertOk()->json();

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
            ->getJson('/api/reports/r/assets.by_status_department/rows?source=rented')->json('summary.0.split');
        $this->assertSame(['purchased' => 0, 'rented' => 2], array_column($rentedOnly, 'value', 'key'));
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

        foreach (['assets.by_status_department', 'assets.transfer_history'] as $key) {
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

        foreach (['assets.by_status_department', 'assets.transfer_history'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/r/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
