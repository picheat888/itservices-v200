<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

// "ภาพรวมของทรัพย์สิน" (assets.overview): when each asset was registered and by whom, hidden on screen until picked.
class AssetOverviewRegisteredColumnsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    private function viewer(): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'assets.view', 'allowed' => true]);

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_rows_carry_the_registration_date_and_who_registered_the_asset(): void
    {
        $this->travelTo('2026-09-24 08:00:00');
        $imported = Asset::factory()->create();
        $this->travelTo('2026-09-25 10:00:00');
        $this->actingAs(User::factory()->create(['name' => 'Anong Register']));
        $byHand = Asset::factory()->create();

        $rows = collect($this->actingAs($this->viewer())->getJson('/api/reports/tabular/assets.overview/rows')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('2026-09-25', $rows[$byHand->id]['registered_at']);
        $this->assertSame('Anong Register', $rows[$byHand->id]['registered_by']);
        $this->assertSame('2026-09-24', $rows[$imported->id]['registered_at']);
        $this->assertNull($rows[$imported->id]['registered_by']);
    }

    public function test_the_columns_start_hidden_and_are_in_the_file(): void
    {
        $viewer = $this->viewer();
        $definition = $this->actingAs($viewer)->getJson('/api/reports/tabular/assets.overview')->assertOk()->json('data');
        $columns = collect($definition['columns'])->keyBy('key');

        $this->assertTrue($columns['registered_at']['hidden']);
        $this->assertTrue($columns['registered_by']['hidden']);
        $this->assertSame(['registered_at', 'registered_by'], array_slice(array_keys($columns->all()), -2));

        Excel::fake();
        Asset::factory()->create();
        $this->exportReport('/api/reports/tabular/assets.overview/export?format=xlsx')->assertAccepted();
        $this->assertExportStored('Report_assets-overview_2026-09-25.xlsx', function (TabularReportExport $export) use ($viewer) {
            $sheet = last($export->sheets());

            return array_slice($sheet->headings(), -2) === ['วันที่ลงทะเบียน', 'ลงทะเบียนโดย']
                && array_slice($sheet->map($export->rows->first()), -2) === ['25/09/2026', $viewer->name];
        });
    }
}
