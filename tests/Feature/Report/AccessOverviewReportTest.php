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
use Tests\TestCase;

/**
 * "ภาพรวมสิทธิ์การเข้าถึง" (access.overview): the register under its active / revoked segments, the
 * tiles, and the breakdown endpoint (months, leavers, departments, resources that need someone).
 */
class AccessOverviewReportTest extends TestCase
{
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
    private function userWith(array $permissions = ['access.overview']): User
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
        return array_map(fn (string $name) => $this->grants[$name]->id, $names);
    }

    /** @return list<array<string, mixed>> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/r/access.overview/rows'.$query)->assertOk()->json('data');
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

    public function test_tiles_count_grants_holders_the_range_leavers_and_resources_to_look_after(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/access.overview/rows')->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(5, $summary['ac_active']['value']);
        $this->assertSame(['email_group' => 1, 'file_share' => 2, 'social_platform' => 0, 'software' => 2], array_column($summary['ac_active']['split'], 'value', 'key'));

        // A, B and D hold something; E holds nothing; C has left.
        $this->assertSame(3, $summary['ac_holders']['value']);
        $this->assertSame(75, $summary['ac_holders']['share']);
        $this->assertEquals(['staff' => 4, 'avg' => 1.3, 'none' => 1], $summary['ac_holders']['note']['values']);

        $this->assertSame(6, $summary['ac_granted']['value']);
        $this->assertSame(2, $summary['ac_granted']['note']['values']['revoked']);
        $this->assertSame('+4', $summary['ac_granted']['note']['texts']['net']);

        $this->assertSame(1, $summary['ac_leavers']['value']);
        $this->assertSame('red', $summary['ac_leavers']['attention']);
        $this->assertSame(['people' => 1, 'days' => 25], $summary['ac_leavers']['note']['values']);

        $this->assertSame(4, $summary['ac_care']['value']);
        $this->assertSame(['owner_gone' => 1, 'no_owner' => 1, 'empty' => 2], array_column($summary['ac_care']['split'], 'value', 'key'));
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

        $this->assertSame(['ให้–ถอนรายเดือน', 'ตามแผนก', 'ผู้ลาออกที่ยังถือสิทธิ์', 'ทรัพยากรที่ต้องดูแล'], array_column($sections, 'title'));
        $this->assertSame('ม.ค. 2026', $sections[0]['rows'][0][0]);
        $this->assertSame('เจ้าของลาออกแล้ว', $sections[3]['rows'][0][0]);
    }

    public function test_the_report_needs_the_access_overview_permission(): void
    {
        $this->actingAs($this->userWith(['access.software_view']))->getJson('/api/reports/r/access.overview/rows')->assertForbidden();
        $this->actingAs($this->userWith(['access.software_view']))->getJson('/api/reports/access/overview/breakdown')->assertForbidden();
    }
}
