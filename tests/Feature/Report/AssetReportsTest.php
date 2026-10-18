<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Brand;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * Two asset tabular reports — "ภาพรวมของทรัพย์สิน" (assets.overview — its list, the old register) and
 * "ประกันใกล้หมดอายุ" (assets.warranty_expiring) — exercised end to end through the
 * generic /reports/tabular/{key} endpoints, the same way TabularReportEngineTest covers
 * contracts.renewals.
 */
class AssetReportsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

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

    public function test_overview_list_lists_every_asset_with_holder_and_department(): void
    {
        $department = Department::create(['code' => 'D-IT', 'name' => 'IT', 'name_th' => 'ไอที']);
        $employee = Employee::create([
            'code' => 'EMP-9001', 'first_name' => 'Somchai', 'last_name' => 'Deploy', 'department_id' => $department->id,
        ]);
        $deployed = Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $employee->id, 'owner' => null]);
        $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);

        $body = $this->actingAs($this->userWith([...$this->reportRights('assets')]))
            ->getJson('/api/reports/tabular/assets.overview/rows')->assertOk()->json();

        $this->assertSame(2, $body['meta']['total']);
        $expectedOrder = collect([$deployed, $ready])->sortBy('asset_code')->pluck('id')->all();
        $this->assertSame($expectedOrder, array_column($body['data'], 'id'));

        $deployedRow = collect($body['data'])->firstWhere('id', $deployed->id);
        $this->assertStringContainsString($employee->code, $deployedRow['holder']);
        $this->assertSame(['name' => 'IT', 'name_th' => 'ไอที', 'code' => 'D-IT'], $deployedRow['department']);
        $this->assertSame('deployed', $deployedRow['status']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $summary['in_use']['value']);
        $this->assertSame(1, $summary['ready']['value']);
    }

    public function test_overview_list_filters_by_status_and_source(): void
    {
        $user = $this->userWith([...$this->reportRights('assets')]);
        $ready = Asset::factory()->create(['status' => 'ready']);
        Asset::factory()->create(['status' => 'deployed']);
        $rented = Asset::factory()->rented()->create(['status' => 'common']);

        $byStatus = $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows?status=ready')->assertOk()->json();
        $this->assertSame(1, $byStatus['meta']['total']);
        $this->assertSame([$ready->id], array_column($byStatus['data'], 'id'));

        $bySource = $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows?source=rented')->assertOk()->json();
        $this->assertSame(1, $bySource['meta']['total']);
        $this->assertSame([$rented->id], array_column($bySource['data'], 'id'));
        // Rented assets store no value of their own — the register must show the linked
        // contract's value instead of the raw (zeroed) asset column. assertEquals (not
        // assertSame): a whole-number float round-trips through JSON as an int.
        $this->assertEquals((float) $rented->contract->value, $bySource['data'][0]['value']);

        $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows?status=bogus')->assertUnprocessable();
    }

    /** The box narrows the list by code, tag, serial, brand or holder; the tiles still count every asset. */
    public function test_overview_search_narrows_the_list_by_code_tag_serial_brand_or_holder(): void
    {
        $user = $this->userWith([...$this->reportRights('assets')]);
        $thai = Employee::create(['code' => 'EMP-8123', 'first_name' => 'Kanya', 'last_name' => 'Holder', 'first_name_th' => 'กัญญา', 'last_name_th' => 'ถือครอง']);
        $english = Employee::create(['code' => 'EMP-8124', 'first_name' => 'Malee', 'last_name' => 'Rose']);
        $acme = Brand::firstOrCreate(['name' => 'Acmebrand']);
        $byThai = Asset::factory()->create(['asset_code' => 'AST-0001', 'tag' => 'TAG-ONE', 'serial' => 'SN111', 'status' => 'deployed', 'owner_employee_id' => $thai->id, 'owner' => null]);
        $byEnglish = Asset::factory()->create(['asset_code' => 'AST-0002', 'tag' => 'TAG-TWO', 'serial' => 'SN222', 'brand_id' => $acme->id, 'status' => 'deployed', 'owner_employee_id' => $english->id, 'owner' => null]);
        $plain = Asset::factory()->create(['asset_code' => 'AST-0003', 'tag' => 'TAG-THREE', 'serial' => 'SN333', 'status' => 'ready', 'owner_employee_id' => null, 'owner' => 'Front desk']);
        $ids = fn (string $search) => array_column($this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows?search='.urlencode($search))->assertOk()->json('data'), 'id');

        $filters = $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview')->assertOk()->json('data.filters');
        $this->assertContains('search', array_column($filters, 'name'));
        $this->assertSame([$byThai->id], $ids('AST-0001'));
        $this->assertSame([$byThai->id], $ids('tag-one'));
        $this->assertSame([$byEnglish->id], $ids('SN222'));
        $this->assertSame([$byEnglish->id], $ids('Acmebrand'));
        $this->assertSame([$byThai->id], $ids('กัญญา'));
        $this->assertSame([$byThai->id], $ids('ถือครอง Kanya'));
        $this->assertSame([$byEnglish->id], $ids('EMP-8124'));
        $this->assertSame([$plain->id], $ids('Front desk'));
        $this->assertSame([], $ids('Nobody'));

        $body = $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows?search=SN222')->assertOk()->json();
        $this->assertSame(1, $body['meta']['total']);
        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['in_use']['value']);
        $this->assertSame(1, $summary['ready']['value']);
    }

    public function test_warranty_expiring_window_excludes_lifetime_rented_and_written_off(): void
    {
        $user = $this->userWith([...$this->reportRights('assets')]);
        $in10 = Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => false]);
        $in60 = Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(60)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(200)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => true]);
        Asset::factory()->create(['status' => 'writeoff', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->rented()->create(['status' => 'ready']);

        $default = $this->actingAs($user)->getJson('/api/reports/tabular/assets.warranty_expiring/rows')->assertOk()->json();
        $this->assertSame([$in10->id, $in60->id], array_column($default['data'], 'id'));
        $this->assertSame(10, $default['data'][0]['days_left']);
        $this->assertSame(60, $default['data'][1]['days_left']);

        $narrow = $this->actingAs($user)->getJson('/api/reports/tabular/assets.warranty_expiring/rows?within=30')->assertOk()->json();
        $this->assertSame(1, $narrow['meta']['total']);
        $summary = collect($narrow['summary'])->keyBy('key');
        $this->assertSame(1, $summary['wty_within_30']['value']);
    }

    public function test_asset_reports_need_assets_view(): void
    {
        $limited = $this->userWith([...$this->reportRights('contracts')]);
        $this->actingAs($limited)->getJson('/api/reports/tabular/assets.overview/rows')->assertForbidden();
        $this->actingAs($limited)->getJson('/api/reports/tabular/assets.warranty_expiring/rows')->assertForbidden();

        $viewer = $this->userWith([...$this->reportRights('assets')]);
        $keys = collect($this->actingAs($viewer)->getJson('/api/reports')->assertOk()->json('data'))->pluck('key')->all();
        $this->assertSame(['assets.overview', 'assets.warranty_expiring', 'assets.transfer_history', 'assets.writeoffs'], $keys);
    }

    public function test_overview_list_export_translates_status_to_thai(): void
    {
        Excel::fake();
        Asset::factory()->create(['status' => 'ready']);

        $this->actingAs($this->userWith([...$this->reportRights('assets')]))
            ->exportReport('/api/reports/tabular/assets.overview/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_assets-overview_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = $this->rowsSheet($export);
            $row = $sheet->map($export->rows->first());

            return in_array('พร้อมส่งมอบ', $row, true);
        });
    }
}
