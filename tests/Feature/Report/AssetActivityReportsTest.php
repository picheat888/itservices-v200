<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "ทรัพย์สินตามสถานะและแผนก" (assets.by_status_department) and "ประวัติโอนย้ายและรับคืน"
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
        $this->assertSame(['No department', 'IT'], $rows->keys()->all());
        $this->assertEquals(3, $rows['No department']['total_count']);
        $this->assertEquals(2, $rows['No department']['st_ready']);
        $this->assertEquals(1, $rows['No department']['st_common']);
        $this->assertEquals(1, $rows['IT']['st_deployed']);
        $this->assertEquals(1, $rows['IT']['st_pending_return']);
        $this->assertSame('ไอที', $rows['IT']['department']['name_th']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(5, $summary['total']['value']);
        $this->assertSame(2, $summary['in_use']['value']);
        $this->assertSame(2, $summary['ready']['value']);
        $this->assertSame(1, $summary['pending_return']['value']);
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
