<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * The two asset tabular reports — "ทะเบียนทรัพย์สิน" (assets.register) and
 * "ประกันใกล้หมดอายุ" (assets.warranty_expiring) — exercised end to end through the
 * generic /reports/r/{key} endpoints, the same way TabularReportEngineTest covers
 * contracts.expiring.
 */
class AssetReportsTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_register_lists_every_asset_with_holder_and_department(): void
    {
        $department = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $employee = Employee::create([
            'code' => 'EMP-9001', 'first_name' => 'Somchai', 'last_name' => 'Deploy', 'department_id' => $department->id,
        ]);
        $deployed = Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $employee->id, 'owner' => null]);
        $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);

        $body = $this->actingAs($this->userWith(['assets.view']))
            ->getJson('/api/reports/r/assets.register/rows')->assertOk()->json();

        $this->assertSame(2, $body['meta']['total']);
        $expectedOrder = collect([$deployed, $ready])->sortBy('asset_code')->pluck('id')->all();
        $this->assertSame($expectedOrder, array_column($body['data'], 'id'));

        $deployedRow = collect($body['data'])->firstWhere('id', $deployed->id);
        $this->assertStringContainsString($employee->code, $deployedRow['holder']);
        $this->assertSame(['name' => 'IT', 'name_th' => 'ไอที'], $deployedRow['department']);
        $this->assertSame('deployed', $deployedRow['status']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $summary['in_use']['value']);
        $this->assertSame(1, $summary['ready']['value']);
    }

    public function test_register_filters_by_status_source_and_search(): void
    {
        $user = $this->userWith(['assets.view']);
        $ready = Asset::factory()->create(['status' => 'ready']);
        Asset::factory()->create(['status' => 'deployed']);
        $rented = Asset::factory()->rented()->create(['status' => 'common']);

        $byStatus = $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?status=ready')->assertOk()->json();
        $this->assertSame(1, $byStatus['meta']['total']);
        $this->assertSame([$ready->id], array_column($byStatus['data'], 'id'));

        $bySource = $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?source=rented')->assertOk()->json();
        $this->assertSame(1, $bySource['meta']['total']);
        $this->assertSame([$rented->id], array_column($bySource['data'], 'id'));
        // Rented assets store no value of their own — the register must show the linked
        // contract's value instead of the raw (zeroed) asset column. assertEquals (not
        // assertSame): a whole-number float round-trips through JSON as an int.
        $this->assertEquals((float) $rented->contract->value, $bySource['data'][0]['value']);

        $bySearch = $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?search='.$ready->serial)->assertOk()->json();
        $this->assertSame(1, $bySearch['meta']['total']);
        $this->assertSame([$ready->id], array_column($bySearch['data'], 'id'));

        $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?status=bogus')->assertUnprocessable();
    }

    public function test_register_search_matches_the_holder_employee(): void
    {
        $user = $this->userWith(['assets.view']);
        $employee = Employee::create(['code' => 'EMP-8123', 'first_name' => 'Kanya', 'last_name' => 'Holder']);
        $held = Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $employee->id, 'owner' => null]);
        Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null, 'owner' => null]);

        $byCode = $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?search='.$employee->code)->assertOk()->json();
        $this->assertSame(1, $byCode['meta']['total']);
        $this->assertSame([$held->id], array_column($byCode['data'], 'id'));

        $byName = $this->actingAs($user)->getJson('/api/reports/r/assets.register/rows?search=Kanya')->assertOk()->json();
        $this->assertSame(1, $byName['meta']['total']);
        $this->assertSame([$held->id], array_column($byName['data'], 'id'));
    }

    public function test_warranty_expiring_window_excludes_lifetime_rented_and_written_off(): void
    {
        $user = $this->userWith(['assets.view']);
        $in10 = Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => false]);
        $in60 = Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(60)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(200)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->create(['status' => 'ready', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => true]);
        Asset::factory()->create(['status' => 'writeoff', 'warranty_end' => today()->addDays(10)->toDateString(), 'warranty_lifetime' => false]);
        Asset::factory()->rented()->create(['status' => 'ready']);

        $default = $this->actingAs($user)->getJson('/api/reports/r/assets.warranty_expiring/rows')->assertOk()->json();
        $this->assertSame([$in10->id, $in60->id], array_column($default['data'], 'id'));
        $this->assertSame(10, $default['data'][0]['days_left']);
        $this->assertSame(60, $default['data'][1]['days_left']);

        $narrow = $this->actingAs($user)->getJson('/api/reports/r/assets.warranty_expiring/rows?within=30')->assertOk()->json();
        $this->assertSame(1, $narrow['meta']['total']);
        $summary = collect($narrow['summary'])->keyBy('key');
        $this->assertSame(1, $summary['within_30']['value']);
    }

    public function test_asset_reports_need_assets_view(): void
    {
        $limited = $this->userWith(['contracts.view']);
        $this->actingAs($limited)->getJson('/api/reports/r/assets.register/rows')->assertForbidden();
        $this->actingAs($limited)->getJson('/api/reports/r/assets.warranty_expiring/rows')->assertForbidden();

        $viewer = $this->userWith(['assets.view']);
        $keys = collect($this->actingAs($viewer)->getJson('/api/reports')->assertOk()->json('data'))->pluck('key')->all();
        $this->assertSame(['assets.register', 'assets.warranty_expiring'], $keys);
    }

    public function test_register_export_translates_status_to_thai(): void
    {
        Excel::fake();
        Asset::factory()->create(['status' => 'ready']);

        $this->actingAs($this->userWith(['assets.view']))
            ->get('/api/reports/r/assets.register/export?format=xlsx')->assertOk();

        Excel::assertDownloaded('Report_assets-register_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = $export->sheets()[1];
            $row = $sheet->map($export->rows->first());

            return in_array('พร้อมส่งมอบ', $row, true);
        });
    }
}
