<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Asset\TransferTrail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "ประวัติโอนย้ายและรับคืน" (assets.transfer_history): what became of each hand-over, the tiles, the
 * breakdown endpoint (months, acceptance, warehouses, departments, categories, assets waiting now)
 * and the new filters.
 */
class AssetTransferHistoryReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const RANGE = 'from=2026-05-01&to=2026-10-07';

    /** @var array<string, AssetTransfer> */
    private array $rows = [];

    /** @var array<string, Asset> */
    private array $assets = [];

    private Department $it;

    private Department $production;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-10-07 10:00:00');
        $this->seedTrail();
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

    private function viewer(): User
    {
        return $this->userWith(['assets.view']);
    }

    private function asset(string $code, Category $category, string $status, ?Employee $holder = null, ?string $owner = null): Asset
    {
        return $this->assets[$code] = Asset::factory()->create([
            'asset_code' => $code, 'category_id' => $category->id, 'status' => $status,
            'owner_employee_id' => $holder?->id, 'owner' => $owner,
        ]);
    }

    private function move(string $name, Asset $asset, string $kind, string $at, string $from, string $to): void
    {
        $row = AssetTransfer::create([
            'asset_id' => $asset->id, 'asset_tag' => $asset->asset_code, 'asset_model' => 'Latitude 5440', 'kind' => $kind,
            'from_owner' => $from, 'to_owner' => $to, 'reason' => null, 'performed_by' => 'IT Team',
        ]);
        AssetTransfer::query()->whereKey($row->id)->update(['created_at' => $at]);
        $this->rows[$name] = $row->fresh();
    }

    private function audit(string $action, Asset|Employee $subject, string $at): void
    {
        AuditLog::query()->insert([
            'action' => $action, 'target' => 'x', 'subject_type' => AuditLog::subjectType($subject), 'subject_id' => $subject->id,
            'created_at' => $at, 'updated_at' => $at,
        ]);
    }

    /** Seven assets, one per outcome (weekend accept, waiting, recalled, asked back, returned, shared, resigned) + a relocation. */
    private function seedTrail(): void
    {
        $this->it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $this->production = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต']);
        $anan = Employee::create(['code' => 'EMP-1', 'first_name' => 'Anan', 'last_name' => 'Tech', 'department_id' => $this->it->id]);
        $nid = Employee::create(['code' => 'EMP-2', 'first_name' => 'Nid', 'last_name' => 'Line', 'department_id' => $this->production->id]);
        $somsak = Employee::create(['code' => 'EMP-3', 'first_name' => 'Somsak', 'last_name' => 'Gone', 'department_id' => $this->production->id, 'status' => 'resigned']);
        Warehouse::create(['name' => 'Main store']);
        Warehouse::create(['name' => 'Plant 2']);
        $laptop = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        $phone = Category::create(['name' => 'Phone', 'name_th' => 'โทรศัพท์']);

        // Friday hand-over, accepted on the Monday.
        $a1 = $this->asset('A1', $laptop, 'deployed', $anan);
        $this->move('a1', $a1, 'handover', '2026-10-02 09:00:00', 'Main store', 'EMP-1');
        $this->audit(TransferTrail::ACCEPTED_ACTION, $a1, '2026-10-05 14:00:00');

        // Not accepted yet.
        $a2 = $this->asset('A2', $laptop, 'pending_acceptance', $nid);
        $this->move('a2', $a2, 'handover', '2026-10-01 09:00:00', 'Main store', 'EMP-2');

        // Handed over, then recalled an hour later.
        $a3 = $this->asset('A3', $phone, 'ready');
        $this->move('a3', $a3, 'handover', '2026-09-10 09:00:00', 'Plant 2', 'EMP-2');
        $this->move('a3_recall', $a3, 'recall', '2026-09-10 10:00:00', 'EMP-2', 'Plant 2');

        // Accepted the same day, asked back later — still waiting for IT.
        $a4 = $this->asset('A4', $phone, 'pending_return', $anan);
        $this->move('a4', $a4, 'handover', '2026-08-03 09:00:00', 'Main store', 'EMP-1');
        $this->audit(TransferTrail::ACCEPTED_ACTION, $a4, '2026-08-03 14:00:00');
        $this->audit(TransferTrail::RETURN_ACTION, $a4, '2026-09-20 09:00:00');

        // Accepted the next day, asked back, returned two days later.
        $a5 = $this->asset('A5', $laptop, 'ready');
        $this->move('a5', $a5, 'handover', '2026-06-01 09:00:00', 'Main store', 'EMP-1');
        $this->audit(TransferTrail::ACCEPTED_ACTION, $a5, '2026-06-02 10:00:00');
        $this->audit(TransferTrail::RETURN_ACTION, $a5, '2026-07-01 09:00:00');
        $this->move('a5_return', $a5, 'return', '2026-07-03 09:00:00', 'EMP-1', 'Main store');

        // Shared use: nobody to accept. Later moved to another floor.
        $a6 = $this->asset('A6', $phone, 'common', null, 'Shared - Meeting room');
        $this->move('a6', $a6, 'handover', '2026-05-05 09:00:00', 'Plant 2', 'Shared - Meeting room');
        $this->move('a6_move', $a6, 'relocate', '2026-07-15 09:00:00', 'Floor 1', 'Floor 2');

        // The receiver resigned before accepting.
        $a7 = $this->asset('A7', $laptop, 'pending_return', $somsak);
        $this->move('a7', $a7, 'handover', '2026-09-28 09:00:00', 'Main store', 'EMP-3');
        $this->audit(TransferTrail::RESIGN_ACTION, $somsak, '2026-09-29 08:00:00');
    }

    /** @return array<string, mixed> */
    public function test_the_breakdown_lists_location_updates_newest_first(): void
    {
        $relocations = $this->breakdown()['relocations'];

        $this->assertCount(1, $relocations);
        $this->assertSame(
            ['at' => '2026-07-15 09:00', 'from' => 'Floor 1', 'to' => 'Floor 2', 'by' => 'IT Team'],
            collect($relocations[0])->only(['at', 'from', 'to', 'by'])->all(),
        );
        $this->assertSame([], $this->breakdown(self::RANGE.'&kind=handover')['relocations']);
    }

    public function test_the_brand_comes_from_the_asset_record_in_the_rows_waiting_and_location_updates(): void
    {
        $zebra = Brand::create(['name' => 'Zebra']);
        $this->assets['A2']->update(['brand_id' => $zebra->id]);
        $this->assets['A6']->update(['brand_id' => $zebra->id]);

        $this->assertSame('Zebra', $this->rowsById()[$this->rows['a6_move']->id]['brand']);
        $this->assertSame('Zebra', $this->breakdown()['relocations'][0]['brand']);
        $this->assertSame('Zebra', $this->breakdown()['waiting'][0]['brand']);

        $named = collect(['a2', 'a6', 'a6_move'])->map(fn (string $n) => $this->rows[$n]->id)->sort()->values()->all();
        $this->assertSame($named, collect(array_keys($this->rowsById(self::RANGE.'&search=Zebra')))->sort()->values()->all());
    }

    private function breakdown(string $query = self::RANGE): array
    {
        return $this->actingAs($this->viewer())
            ->getJson('/api/reports/assets/transfer-history/breakdown?'.$query)->assertOk()->json('data');
    }

    /** @return array<int, array<string, mixed>> */
    private function rowsById(string $query = self::RANGE): array
    {
        return collect($this->actingAs($this->viewer())
            ->getJson('/api/reports/r/assets.transfer_history/rows?per_page=100&'.$query)->assertOk()->json('data'))
            ->keyBy('id')->all();
    }

    public function test_each_hand_over_says_what_became_of_it(): void
    {
        $rows = $this->rowsById();
        $outcome = fn (string $name) => $rows[$this->rows[$name]->id]['outcome'];
        $hours = fn (string $name) => $rows[$this->rows[$name]->id]['outcome_hours'];

        $this->assertSame('accepted', $outcome('a1'));
        $this->assertEquals(77, $hours('a1'));
        $this->assertSame('waiting', $outcome('a2'));
        $this->assertEquals(145, $hours('a2'));
        $this->assertSame('recalled', $outcome('a3'));
        $this->assertSame('accepted', $outcome('a4'));
        $this->assertEquals(5, $hours('a4'));
        $this->assertSame('returned', $outcome('a5_return'));
        $this->assertEquals(48, $hours('a5_return'));
        $this->assertSame('not_needed', $outcome('a6'));
        $this->assertSame('never_accepted', $outcome('a7'));
        $this->assertNull($outcome('a3_recall'));
        $this->assertNull($outcome('a6_move'));
    }

    public function test_each_end_reads_as_an_employee_warehouse_location_or_shared_label(): void
    {
        $rows = $this->rowsById();
        $a1 = $rows[$this->rows['a1']->id];
        $this->assertSame('warehouse', $a1['from_type']);
        $this->assertSame('employee', $a1['to_type']);
        $this->assertSame('Anan Tech', $a1['to_name']);
        $this->assertSame('EMP-1', $a1['to_code']);
        $this->assertSame(['name' => 'IT', 'name_th' => 'ไอที'], $a1['to_department']);
        $this->assertSame('Anan Tech (EMP-1)', $a1['to_label']);
        $this->assertSame(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป'], $a1['category']);
        $this->assertEquals(1, $a1['asset_moves']);
        $this->assertEquals(2, $rows[$this->rows['a3']->id]['asset_moves']);
        $this->assertSame('shared', $rows[$this->rows['a6']->id]['to_type']);
        $this->assertSame('location', $rows[$this->rows['a6_move']->id]['to_type']);
        $this->assertEquals(1, $rows[$this->rows['a7']->id]['to_resigned']);
    }

    public function test_the_tiles_count_hand_overs_returns_waiting_and_the_acceptance_median(): void
    {
        $summary = collect($this->actingAs($this->viewer())
            ->getJson('/api/reports/r/assets.transfer_history/rows?'.self::RANGE)->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(7, $summary['th_handovers']['value']);
        $this->assertSame([6, 1], array_column($summary['th_handovers']['split'], 'value'));
        $this->assertSame(2, $summary['th_back_in']['value']);
        $this->assertSame([1, 1], array_column($summary['th_back_in']['split'], 'value'));
        $this->assertSame(3, $summary['th_waiting_now']['value']);
        $this->assertSame([1, 2], array_column($summary['th_waiting_now']['split'], 'value'));
        // A4 has waited 17 days.
        $this->assertSame('red', $summary['th_waiting_now']['attention']);
        $this->assertEquals(25, $summary['th_accept_median']['value']);
        $this->assertNull($summary['th_accept_median']['note']);
        $this->assertSame(1, $summary['th_relocations']['value']);
        // A6 was handed to shared use before it moved.
        $this->assertSame(['employee' => 0, 'shared' => 1, 'store' => 0], array_column($summary['th_relocations']['split'], 'value', 'key'));
        $this->assertSame([1, 1, 1], array_column($summary['th_accept_median']['split'], 'value'));
    }

    public function test_the_breakdown_lists_every_month_of_the_range_by_kind(): void
    {
        $months = collect($this->breakdown()['months'])->keyBy('month');

        $this->assertSame(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], $months->keys()->all());
        $this->assertSame(['month' => '2026-07', 'handover' => 0, 'return' => 1, 'recall' => 0, 'relocate' => 1], $months['2026-07']);
        $this->assertSame(2, $months['2026-09']['handover']);
        $this->assertSame(1, $months['2026-09']['recall']);
        $this->assertSame(2, $months['2026-10']['handover']);
    }

    public function test_the_breakdown_buckets_acceptance_times_and_spots_weekends(): void
    {
        $this->assertSame([
            'to_people' => 6, 'to_shared' => 1, 'same_day' => 1, 'next_day' => 1, 'later' => 1, 'later_weekend' => 1,
            'waiting' => 1, 'recalled' => 1, 'never_accepted' => 1, 'median_hours' => 25, 'within_2_days' => 2,
        ], $this->breakdown()['acceptance']);
    }

    public function test_the_breakdown_counts_warehouses_departments_and_categories(): void
    {
        $breakdown = $this->breakdown();

        $this->assertSame([
            ['name' => 'Main store', 'out' => 5, 'back' => 1],
            ['name' => 'Plant 2', 'out' => 2, 'back' => 1],
        ], $breakdown['warehouses']);
        $this->assertSame([['IT', 3], ['Production', 3]], array_map(fn (array $d) => [$d['name'], $d['count']], $breakdown['departments']));
        $this->assertSame([['Laptop', 4], ['Phone', 3]], array_map(fn (array $c) => [$c['name'], $c['count']], $breakdown['categories']));
    }

    public function test_waiting_now_ignores_the_date_range_and_dates_each_wait_from_its_cause(): void
    {
        $waiting = $this->breakdown('from=2026-01-01&to=2026-01-31')['waiting'];

        $this->assertSame(['A2', 'A4', 'A7'], array_column($waiting, 'code'));
        $this->assertSame(['handover', 'request', 'resign'], array_column($waiting, 'cause'));
        $this->assertSame([6, 17, 8], array_column($waiting, 'days'));
        $this->assertSame('2026-09-29 08:00', $waiting[2]['since']);
        $this->assertSame('ไอที', $waiting[1]['holder']['department']['name_th']);

        $onlyIt = $this->breakdown('from=2026-01-01&to=2026-01-31&department_id='.$this->it->id)['waiting'];
        $this->assertSame(['A4'], array_column($onlyIt, 'code'));
    }

    public function test_warehouse_category_department_and_name_search_narrow_the_rows(): void
    {
        $plant2 = Warehouse::where('name', 'Plant 2')->value('id');
        $phone = Category::where('name', 'Phone')->value('id');
        $ids = fn (string $query) => array_keys($this->rowsById(self::RANGE.'&'.$query));
        $named = fn (array $names) => collect($names)->map(fn (string $n) => $this->rows[$n]->id)->sort()->values()->all();
        $sorted = fn (array $ids) => collect($ids)->sort()->values()->all();

        $this->assertSame($named(['a3', 'a3_recall', 'a6']), $sorted($ids('warehouse_id='.$plant2)));
        $this->assertSame($named(['a3', 'a3_recall', 'a4', 'a6', 'a6_move']), $sorted($ids('category_id='.$phone)));
        $this->assertSame($named(['a2', 'a3', 'a3_recall', 'a7']), $sorted($ids('department_id='.$this->production->id)));
        $this->assertSame($named(['a2', 'a3', 'a3_recall']), $sorted($ids('search=Nid')));
    }

    public function test_the_range_defaults_to_this_year(): void
    {
        $definition = $this->actingAs($this->viewer())->getJson('/api/reports/r/assets.transfer_history')->assertOk()->json('data.filters');
        $from = collect($definition)->firstWhere('name', 'from');

        $this->assertSame('2026-01-01', $from['default']);
    }

    public function test_the_breakdown_needs_assets_view(): void
    {
        $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/assets/transfer-history/breakdown?'.self::RANGE)->assertForbidden();
    }

    public function test_the_xlsx_export_carries_the_breakdown_sheets_before_the_list(): void
    {
        Excel::fake();

        $this->actingAs($this->viewer())
            ->exportReport('/api/reports/r/assets.transfer_history/export?format=xlsx&'.self::RANGE)->assertAccepted();

        $brand = $this->assets['A6']->brand->name;
        $this->assertExportStored('Report_assets-transfer_history_2026-10-07.xlsx', function (TabularReportExport $export) use ($brand) {
            $sheets = $export->sheets();
            $titles = array_map(fn ($sheet) => $sheet->title(), $sheets);
            $waiting = collect($sheets)->first(fn ($sheet) => $sheet->title() === 'ค้างอยู่ตอนนี้');
            $moves = collect($sheets)->first(fn ($sheet) => $sheet->title() === 'อัปเดตสถานที่');
            $acceptance = collect($sheets)->first(fn ($sheet) => $sheet->title() === 'การกดรับมอบ');

            return count($sheets) === 9
                && $moves->array() === [['2026-07-15 09:00', 'A6', $brand, 'Latitude 5440', 'Floor 1', 'Floor 2', null, 'IT Team']]
                && $moves->headings() === ['วันที่', 'รหัสทรัพย์สิน', 'ยี่ห้อ', 'รุ่น', 'จาก', 'ไปยัง', 'เหตุผล', 'ผู้ดำเนินการ']
                && $waiting->headings()[1] === 'ยี่ห้อ'
                && in_array(['ส่งมอบเป็นส่วนกลาง (ไม่ต้องกดรับ)', 1], $acceptance->array(), true)
                && in_array(['รอกดรับ', 1], $acceptance->array(), true)
                && in_array('การกดรับมอบ', $titles, true)
                && $waiting->array()[0][0] === 'A2'
                && $waiting->array()[2][7] === 'ลาออก';
        });
    }
}
