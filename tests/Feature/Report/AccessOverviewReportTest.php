<?php

namespace Tests\Feature\Report;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Report\Access\AccessOverviewReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ภาพรวมสิทธิ์การเข้าถึง" (access.overview): the register under its active / revoked segments, the
 * tiles, and the breakdown endpoint (months, leavers, departments, resources that need someone).
 */
class AccessOverviewReportTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    /** @var array<string, AccessMembership> */
    private array $grants;

    /** @var array<string, Model> */
    private array $set;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $qc = Department::create(['name' => 'Quality', 'name_th' => 'ฝ่ายควบคุมคุณภาพ', 'tag' => 'QC']);
        $person = fn (string $code, Department $d, array $extra = []) => Employee::create([
            'code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d->id, 'status' => 'active', ...$extra,
        ]);
        $a = $person('EMP-A', $prod);
        $b = $person('EMP-B', $qc);
        $c = $person('EMP-C', $prod, ['status' => 'resigned', 'last_day' => '2026-08-31']);
        // Resigned, but the last day is still ahead: still working.
        $d = $person('EMP-D', $qc, ['status' => 'resigned', 'last_day' => '2026-10-31']);
        $person('EMP-E', $prod);

        $this->set = [
            'eg1' => EmailGroup::create(['name' => 'Production Team', 'email' => 'prod@x.co', 'department_id' => $prod->id, 'owner_employee_id' => $a->id]),
            'eg2' => EmailGroup::create(['name' => 'Spare', 'email' => 'spare@x.co']),
            'fs1' => FileShare::create(['name' => 'QC Docs', 'path' => '\\\\fs\\qc', 'department_id' => $qc->id, 'owner_employee_id' => $c->id]),
            'sp1' => SocialPlatform::create(['name' => 'LINE', 'url' => 'line.me']),
            'sw1' => Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 10]),
        ];
        $by = User::factory()->create(['name' => 'IT Admin']);
        $grant = fn (Model $r, Employee $e, string $at, array $extra = []) => AccessMembership::create([
            'resource_type' => $r->getMorphClass(), 'resource_id' => $r->getKey(), 'employee_id' => $e->id,
            'granted_at' => $at, 'granted_by' => $by->id, 'purpose' => 'Daily work', ...$extra,
        ]);

        $this->grants = [
            'm1' => $grant($this->set['eg1'], $a, '2026-02-10 09:00'),
            'm2' => $grant($this->set['fs1'], $b, '2026-03-05 09:00', ['access_level' => 'Write']),
            // Production's person in QC's share: across departments.
            'm3' => $grant($this->set['fs1'], $a, '2026-04-01 09:00', ['access_level' => 'Read']),
            // Still held by someone who has left.
            'm4' => $grant($this->set['sw1'], $c, '2026-01-15 09:00'),
            // Taken back the day after the last day: on leaving.
            'm5' => $grant($this->set['eg1'], $c, '2026-02-01 09:00', ['revoked_at' => '2026-09-01 10:00', 'revoked_by' => $by->id]),
            // Taken back while still working.
            'm6' => $grant($this->set['sp1'], $b, '2026-05-10 09:00', ['revoked_at' => '2026-06-20 10:00', 'revoked_by' => $by->id]),
            // Granted before the range.
            'm7' => $grant($this->set['sw1'], $d, '2025-12-01 09:00'),
        ];
    }

    /** @param list<string> $permissions */
    private function userWith(?array $permissions = null): User
    {
        $permissions ??= $this->reportRights('access');
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<int> */
    private function ids(string ...$names): array
    {
        return array_map(fn (string $name) => $this->grants[$name]->id, $names);
    }

    /** @return list<array<string, mixed>> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows'.$query)->assertOk()->json('data');
    }

    public function test_the_register_lists_active_grants_leavers_first_and_says_what_each_is(): void
    {
        $rows = $this->rows();

        $this->assertCount(5, $rows);
        $this->assertSame($this->grants['m4']->id, $rows[0]['id']);
        $status = array_column($rows, 'status', 'id');
        $this->assertSame('left', $status[$this->grants['m4']->id]);
        $this->assertSame('cross', $status[$this->grants['m3']->id]);
        $this->assertSame('active', $status[$this->grants['m2']->id]);
        $this->assertSame('active', $status[$this->grants['m7']->id]);

        $cross = collect($rows)->firstWhere('id', $this->grants['m3']->id);
        $this->assertSame('Read', $cross['level']);
        $this->assertSame('ฝ่ายควบคุมคุณภาพ', $cross['resource_department']['name_th']);
        $this->assertSame('/employees?view='.$this->grants['m3']->employee_id, $cross['_links']['employee']);
        $this->assertSame(25, collect($rows)->firstWhere('id', $this->grants['m4']->id)['left_days']);
    }

    public function test_the_register_narrows_by_state_type_and_the_holders_department(): void
    {
        $revoked = $this->rows('?state=revoked');
        $this->assertSame($this->ids('m5', 'm6'), array_column($revoked, 'id'));
        $this->assertSame('IT Admin', $revoked[0]['revoked_by']);
        $this->assertSame('2026-09-01 10:00', $revoked[0]['revoked_at']);

        $this->assertCount(7, $this->rows('?state=all'));
        $this->assertEqualsCanonicalizing($this->ids('m2', 'm3'), array_column($this->rows('?type=file_share'), 'id'));
        $qc = Department::where('tag', 'QC')->value('id');
        $this->assertEqualsCanonicalizing($this->ids('m2', 'm7'), array_column($this->rows('?department_id='.$qc), 'id'));
    }

    public function test_search_narrows_the_register_by_employee_code_name_or_resource(): void
    {
        $thai = Employee::create(['code' => 'EMP-T1', 'first_name' => 'Manop', 'last_name' => 'Chai', 'first_name_th' => 'มานพ', 'last_name_th' => 'ใจดี', 'status' => 'active']);
        $english = Employee::create(['code' => 'EMP-T2', 'first_name' => 'Malee', 'last_name' => 'Rose', 'status' => 'active']);
        $grant = fn (string $resource, Employee $e) => AccessMembership::create([
            'resource_type' => $this->set[$resource]->getMorphClass(), 'resource_id' => $this->set[$resource]->getKey(), 'employee_id' => $e->id, 'granted_at' => '2026-06-01 09:00',
        ]);
        $t1 = $grant('eg2', $thai);
        $t2 = $grant('sp1', $english);

        $this->assertSame([$t1->id], array_column($this->rows('?search='.urlencode('มานพ')), 'id'));
        $this->assertSame([$t1->id], array_column($this->rows('?search='.urlencode('ใจดี Manop')), 'id'));
        $this->assertSame([$t2->id], array_column($this->rows('?search=Malee'), 'id'));
        $this->assertSame([$t2->id], array_column($this->rows('?search=EMP-T2'), 'id'));
        // The resource's name, in any word order with the holder's code.
        $this->assertSame([$t2->id], array_column($this->rows('?search=LINE+EMP-T2'), 'id'));
        $this->assertEqualsCanonicalizing($this->ids('m2', 'm3'), array_column($this->rows('?search='.urlencode('QC Docs')), 'id'));
        $this->assertSame([], $this->rows('?search=Nobody'));

        // The tiles still count every grant.
        $tiles = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows?search=Malee')->json('summary'))->keyBy('key');
        $this->assertSame(7, $tiles['ac_active']['value']);
    }

    public function test_tiles_count_grants_holders_the_range_leavers_and_resources_to_look_after(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows')->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(5, $summary['ac_active']['value']);
        $this->assertSame(['email_group' => 1, 'file_share' => 2, 'social_platform' => 0, 'software' => 2], array_column($summary['ac_active']['split'], 'value', 'key'));

        // A, B and D hold something; E holds nothing; C has left.
        $this->assertSame(3, $summary['ac_holders']['value']);
        $this->assertSame(75, $summary['ac_holders']['share']);
        $this->assertSame('rep_n_ac_holders_short', $summary['ac_holders']['note']['label_key']);
        $this->assertSame('rep_n_ac_holders', $summary['ac_holders']['note']['full_key']);
        // A holds two, B and D one each: the typical holder holds one.
        $this->assertSame(['staff' => 4, 'median' => 1, 'none' => 1], $summary['ac_holders']['note']['values']);

        $this->assertSame(6, $summary['ac_granted']['value']);
        $note = $summary['ac_granted']['note'];
        $this->assertSame(['label_key' => 'rep_n_ac_granted', 'values' => ['revoked' => 2]], array_diff_key($note, ['trend' => 0]));
        $this->assertSame(['direction' => 'up', 'label_key' => 'rep_n_ac_net_up', 'values' => ['net' => 4]], array_diff_key($note['trend'], ['points' => 0]));
        // The line climbs by the same four over the range, ending on what is active now.
        $this->assertCount(7, $note['trend']['points']);
        $this->assertSame(4, end($note['trend']['points']) - $note['trend']['points'][0]);
        $this->assertSame(5, end($note['trend']['points']));

        $this->assertSame(1, $summary['ac_leavers']['value']);
        $this->assertSame('red', $summary['ac_leavers']['attention']);
        $this->assertSame(['people' => 1, 'days' => 25], $summary['ac_leavers']['note']['values']);

        $this->assertSame(4, $summary['ac_care']['value']);
        $this->assertSame(['owner_gone' => 1, 'no_owner' => 1, 'empty' => 2], array_column($summary['ac_care']['split'], 'value', 'key'));

        // Long names carry a short one for the tile's one-line footer.
        $this->assertSame('rep_ac_type_email_group_short', array_column($summary['ac_active']['split'], 'short_key', 'key')['email_group']);
        $this->assertSame('rep_ac_care_owner_gone_short', array_column($summary['ac_care']['split'], 'short_key', 'key')['owner_gone']);
    }

    public function test_a_type_filter_splits_the_active_tile_by_that_type_only(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows?type=file_share')->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(2, $summary['ac_active']['value']);
        $this->assertSame(['file_share' => 2], array_column($summary['ac_active']['split'], 'value', 'key'));
    }

    public function test_the_holders_note_says_so_when_everyone_working_holds_some(): void
    {
        // Quality: B and D both still work and both hold something.
        $department = Department::where('tag', 'QC')->value('id');
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows?department_id='.$department)->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(2, $summary['ac_holders']['value']);
        $this->assertSame('rep_n_ac_holders_all_short', $summary['ac_holders']['note']['label_key']);
        $this->assertSame('rep_n_ac_holders_all', $summary['ac_holders']['note']['full_key']);
        $this->assertSame(0, $summary['ac_holders']['note']['values']['none']);
    }

    public function test_breakdown_draws_months_leavers_departments_and_care(): void
    {
        $data = $this->actingAs($this->userWith())->getJson('/api/reports/access/overview/breakdown')->assertOk()->json('data');

        $this->assertSame(['email_group' => 1, 'file_share' => 2, 'social_platform' => 0, 'software' => 2], $data['types']);
        $narrow = $this->actingAs($this->userWith())->getJson('/api/reports/access/overview/breakdown?type=software')->json('data');
        $this->assertSame($data['types'], $narrow['types']);
        $this->assertSame(['active' => 5, 'revoked' => 2, 'all' => 7], $data['states']);

        $months = collect($data['months'])->keyBy('month');
        $this->assertCount(9, $months);
        $this->assertSame(2, $months['2026-02']['granted']);
        $this->assertSame(['email_group' => 2, 'file_share' => 0, 'social_platform' => 0, 'software' => 0], $months['2026-02']['by_type']);
        $this->assertSame([1, 0], [$months['2026-06']['revoked_work'], $months['2026-06']['revoked_leave']]);
        $this->assertSame([0, 1], [$months['2026-09']['revoked_work'], $months['2026-09']['revoked_leave']]);

        $this->assertSame('EMP-C', $data['leavers']['people'][0]['code']);
        $this->assertSame(25, $data['leavers']['people'][0]['days']);
        $this->assertSame(['AutoCAD'], array_column($data['leavers']['people'][0]['grants'], 'name'));
        $this->assertSame('QC Docs', $data['leavers']['owned'][0]['name']);
        $this->assertSame(1, $data['leavers']['resigned']);

        [$prod, $qc] = $data['departments'];
        $this->assertSame(['ฝ่ายผลิต', 3, 1, 2, 1], [$prod['name_th'], $prod['grants'], $prod['holders'], $prod['staff'], $prod['leavers']]);
        $this->assertSame(['ฝ่ายควบคุมคุณภาพ', 2, 2, 2, 0], [$qc['name_th'], $qc['grants'], $qc['holders'], $qc['staff'], $qc['leavers']]);

        $this->assertSame(['QC Docs'], array_column($data['care']['owner_gone'], 'name'));
        $this->assertSame(['Spare'], array_column($data['care']['no_owner'], 'name'));
        $this->assertEqualsCanonicalizing(['Spare', 'LINE'], array_column($data['care']['empty'], 'name'));
    }

    public function test_the_granted_note_says_whether_the_range_ended_with_more_fewer_or_the_same(): void
    {
        $note = fn (string $range) => collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.overview/rows?'.$range)->assertOk()->json('summary'))
            ->firstWhere('key', 'ac_granted')['note'];

        // June: LINE taken back from B, nothing granted.
        $june = $note('from=2026-06-01&to=2026-06-30')['trend'];
        $this->assertSame(['direction' => 'down', 'label_key' => 'rep_n_ac_net_down', 'values' => ['net' => 1]], array_diff_key($june, ['points' => 0]));
        $this->assertSame(-1, end($june['points']) - $june['points'][0]);
        $this->assertSame(['direction' => 'even', 'label_key' => 'rep_n_ac_net_even', 'values' => ['net' => 0]], array_diff_key($note('from=2026-07-01&to=2026-07-31')['trend'], ['points' => 0]));
    }

    public function test_the_department_filter_narrows_the_cards_but_not_the_resources_to_look_after(): void
    {
        $qc = Department::where('tag', 'QC')->value('id');
        $data = $this->actingAs($this->userWith())->getJson('/api/reports/access/overview/breakdown?department_id='.$qc)->assertOk()->json('data');

        $this->assertSame([], $data['leavers']['people']);
        $this->assertCount(1, $data['departments']);
        $this->assertCount(2, $data['care']['empty']);
    }

    public function test_the_file_carries_the_cards_as_sheets(): void
    {
        $report = app(AccessOverviewReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['ให้–ถอนรายเดือน', 'ตามแผนก', 'ผู้ลาออกที่ยังถือสิทธิ์', 'Resource ที่ต้องดูแล'], array_column($sections, 'title'));
        // A month cell: Excel writes the real date, the PDF the date setting
        $this->assertSame('2026-01', $sections[0]['rows'][0][0]->at->format('Y-m'));
        $this->assertSame('ม.ค. 2026', $sections[0]['rows'][0][0]->display());
        $this->assertSame('เจ้าของลาออกแล้ว', $sections[3]['rows'][0][0]);
    }

    public function test_the_report_needs_the_access_report_switch(): void
    {
        $workspaceOnly = $this->userWith(['access.module', 'access.overview', ...$this->reportRights('assets')]);

        $this->actingAs($workspaceOnly)->getJson('/api/reports/tabular/access.overview/rows')->assertForbidden();
        $this->actingAs($workspaceOnly)->getJson('/api/reports/access/overview/breakdown')->assertForbidden();
    }
}
