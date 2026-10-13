<?php

namespace Tests\Feature\Report;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "ภาพรวมพนักงาน" (employees.overview): the joiner and leaver rows, and the breakdown behind its tiles,
 * headcount chart, department table and leavers still holding access.
 */
class EmployeeOverviewReportTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-10-13 10:00:00');
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
    private function employee(string $name, array $attributes = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'code' => sprintf('EMP-%03d', $this->seq), 'first_name' => $name, 'last_name' => 'Test',
            'joined_at' => '2024-01-01', 'status' => 'active',
        ], $attributes));
    }

    private function onboarding(Employee $employee, string $status): ServiceRequest
    {
        return ServiceRequest::create([
            'type' => 'computer', 'origin' => 'onboarding', 'employee_id' => $employee->id,
            'requester_name' => $employee->name, 'title' => 'Computer', 'reason' => 'New starter.', 'status' => $status,
        ]);
    }

    private function grant(Employee $employee, string $name, ?string $revokedAt = null): void
    {
        $group = EmailGroup::create(['name' => $name, 'email' => strtolower(str_replace(' ', '.', $name)).'@x.co']);
        AccessMembership::create([
            'resource_type' => 'email_group', 'resource_id' => $group->id, 'employee_id' => $employee->id,
            'access_level' => 'member', 'granted_at' => '2024-01-01', 'revoked_at' => $revokedAt,
        ]);
    }

    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/employees/overview/breakdown?from=2026-01-01&to=2026-10-31'.$query)->assertOk()->json('data');
    }

    // ── rows ──────────────────────────────────────────────────────────────────────

    public function test_rows_list_joiners_and_leavers_and_a_person_who_did_both_twice(): void
    {
        $joiner = $this->employee('Joiner', ['joined_at' => '2026-03-02']);
        $leaver = $this->employee('Leaver', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-05-31', 'resign_reason' => 'Moved']);
        $both = $this->employee('Both', ['joined_at' => '2026-02-01', 'status' => 'resigned', 'last_day' => '2026-04-30']);
        $future = $this->employee('Future', ['joined_at' => '2026-10-20']);
        $this->employee('Old', ['joined_at' => '2019-01-01']);
        $user = $this->userWith(['employees.view']);

        $rows = $this->actingAs($user)->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data');

        $pairs = array_map(fn (array $r) => $r['employee_code'].':'.$r['movement_kind'], $rows);
        $this->assertEqualsCanonicalizing(
            [$joiner->code.':joined', $leaver->code.':left', $both->code.':joined', $both->code.':left', $future->code.':joined'],
            $pairs,
        );
        $this->assertSame(count($rows), count(array_unique(array_column($rows, 'id'))), 'row ids are unique');
        // Event date order.
        $this->assertSame([$both->code, $joiner->code, $both->code, $leaver->code, $future->code], array_column($rows, 'employee_code'));
        $byKey = collect($rows)->keyBy(fn (array $r) => $r['employee_code'].':'.$r['movement_kind']);
        $this->assertSame('/employees?view='.$both->id, $byKey[$both->code.':left']['_links']['employee']);
        $this->assertSame('Moved', $byKey[$leaver->code.':left']['resign_reason']);
        $this->assertSame(7, $byKey[$future->code.':joined']['upcoming_days']);
        $this->assertNull($byKey[$both->code.':left']['prep_status']);
        $this->assertSame('none', $byKey[$both->code.':joined']['prep_status']);
    }

    public function test_leaver_rows_count_assets_and_open_grants_joiner_rows_show_preparation(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        $this->grant($leaver, 'All Staff');
        $this->grant($leaver, 'Old Group', '2026-09-30 12:00:00');
        $joiner = $this->employee('Joiner', ['joined_at' => '2026-10-01']);
        $this->onboarding($joiner, 'pending');
        $this->onboarding($joiner, 'completed');

        $rows = collect($this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data'))
            ->keyBy('movement_kind');

        $this->assertSame(1, $rows['left']['open_grants']);
        $this->assertSame(0, $rows['left']['assets_held']);
        $this->assertSame('preparing', $rows['joined']['prep_status']);
        $this->assertSame('1/2', $rows['joined']['onboarding']);
        $this->assertSame(-12, $rows['joined']['upcoming_days']);
        $this->assertNull($rows['joined']['open_grants']);
    }

    public function test_same_day_join_and_leave_is_two_rows_and_counts_in_both(): void
    {
        $this->employee('OneDay', ['joined_at' => '2026-06-01', 'status' => 'resigned', 'last_day' => '2026-06-01']);

        $rows = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data');
        $data = $this->breakdown();

        $this->assertSame(['joined', 'left'], array_column($rows, 'movement_kind'));
        $this->assertSame(1, $data['joiners']['started']);
        $this->assertSame(1, $data['leavers']['count']);
    }

    public function test_kind_filter_narrows_the_rows_only(): void
    {
        $this->employee('Joiner', ['joined_at' => '2026-03-02']);
        $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-05-31']);
        $user = $this->userWith(['employees.view']);

        $body = $this->actingAs($user)->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31&kind=left')->assertOk()->json();

        $this->assertSame(['left'], array_values(array_unique(array_column($body['data'], 'movement_kind'))));
        $tiles = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $tiles['eo_joined']['value'], 'the tiles ignore the kind filter');
        $this->assertSame(1, $tiles['eo_left']['value']);
    }

    public function test_overview_needs_employees_view(): void
    {
        $this->actingAs($this->userWith(['assets.view']))->getJson('/api/reports/r/employees.overview/rows')->assertForbidden();
        $this->actingAs($this->userWith(['assets.view']))->getJson('/api/reports/employees/overview/breakdown')->assertForbidden();
    }

    public function test_old_key_is_gone(): void
    {
        $this->actingAs($this->userWith(['employees.view']))->getJson('/api/reports/r/employees.joiners_leavers/rows')->assertNotFound();
    }

    // ── breakdown ─────────────────────────────────────────────────────────────────

    public function test_headcount_joiners_leavers_and_rate(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);
        $this->employee('NoJoinDate', ['joined_at' => null]);
        $this->employee('Joiner', ['joined_at' => '2026-03-02']);
        $this->employee('Future', ['joined_at' => '2026-10-20']);
        $this->employee('Leaver', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-05-31']);
        $this->employee('Both', ['joined_at' => '2026-02-01', 'status' => 'resigned', 'last_day' => '2026-04-30']);
        $this->employee('LeftLongAgo', ['joined_at' => '2015-01-01', 'status' => 'resigned', 'last_day' => null]);
        $this->employee('NoticeGiven', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-10-25']);

        $data = $this->breakdown();

        $this->assertSame('2026-10-13', $data['as_of']);
        // No start date is never counted as working; resigned without a last day has left.
        $this->assertSame(3, $data['headcount']['start']); // Stay, Leaver, NoticeGiven
        $this->assertSame(3, $data['headcount']['end']);   // Stay, Joiner, NoticeGiven
        $this->assertSame(['started' => 2, 'upcoming' => 1], $data['joiners']);
        $this->assertSame(3, $data['leavers']['count']);   // Leaver, Both, NoticeGiven
        $this->assertSame(100.0, (float) $data['leavers']['rate']);
        $this->assertSame(1, $data['leavers']['still_working']);
    }

    public function test_nobody_at_all_gives_no_rate_and_no_nan(): void
    {
        $body = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json();
        $data = $this->breakdown();

        $this->assertNull($data['leavers']['rate']);
        $this->assertSame(['start' => 0, 'end' => 0], $data['headcount']);
        $this->assertSame('—', collect($body['summary'])->keyBy('key')['eo_left']['note']['texts']['rate']);
    }

    public function test_swapped_range_and_future_end_use_today(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);

        $data = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/employees/overview/breakdown?from=2027-12-31&to=2026-01-01')->assertOk()->json('data');

        $this->assertSame('2026-10-13', $data['as_of']);
        $this->assertSame(1, $data['headcount']['end']);
        $this->assertSame('2026-01-01', $data['from']);
    }

    public function test_a_range_wholly_ahead_has_no_chart_points(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);

        $data = $this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/employees/overview/breakdown?from=2027-01-01&to=2027-03-31')->assertOk()->json('data');

        $this->assertSame([], $data['points']);
        $this->assertSame('2027-01-01', $data['as_of']);
    }

    public function test_long_ranges_bucket_by_quarter_then_year(): void
    {
        $this->employee('Stay', ['joined_at' => '2010-01-01']);
        $user = $this->userWith(['employees.view']);

        $quarter = $this->actingAs($user)->getJson('/api/reports/employees/overview/breakdown?from=2023-01-01&to=2026-10-31')->json('data');
        $year = $this->actingAs($user)->getJson('/api/reports/employees/overview/breakdown?from=2015-01-01&to=2026-10-31')->json('data');

        $this->assertSame('quarter', $quarter['bucket']);
        $this->assertSame('year', $year['bucket']);
        $this->assertTrue(collect($year['points'])->every(fn (array $p) => $p['end'] <= '2026-10-13'), 'no point after today');
        $this->assertSame('2026-10-13', collect($year['points'])->last()['end']);
        $this->assertTrue(collect($year['points'])->last()['current']);
    }

    public function test_the_first_point_starts_from_the_day_before_the_range(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);
        $this->employee('FirstDay', ['joined_at' => '2026-01-01']);

        $first = $this->breakdown()['points'][0];

        $this->assertSame(1, $first['base']);
        $this->assertSame(1, $first['joined']);
        $this->assertSame($first['base'] + $first['joined'] - $first['left'], $first['headcount']);
    }

    public function test_a_leaver_drops_the_line_in_the_month_after_their_last_day(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);
        $this->employee('MarchLast', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-03-31']);
        $this->employee('Future', ['joined_at' => '2026-10-20']);

        $points = collect($this->breakdown()['points'])->keyBy(fn (array $p) => substr($p['end'], 0, 7));

        $this->assertSame(2, $points['2026-03']['headcount']);
        $this->assertSame(0, $points['2026-03']['left']);
        $this->assertSame(1, $points['2026-04']['headcount']);
        $this->assertSame(1, $points['2026-04']['left']);
        $this->assertSame('MarchLast', explode(' ', $points['2026-04']['events'][0]['name'])[0]);
        $this->assertSame(0, $points['2026-10']['joined'], 'a joiner yet to start is not in the chart');
        $this->assertCount(10, $points);
    }

    public function test_prep_tile_counts_preparing_joiners_and_flags_urgency(): void
    {
        $soon = $this->employee('Soon', ['joined_at' => '2026-10-16']);
        $this->onboarding($soon, 'pending');
        $this->onboarding($soon, 'completed');
        $ready = $this->employee('Ready', ['joined_at' => '2026-09-01']);
        $this->onboarding($ready, 'completed');

        $prep = $this->breakdown()['prep'];

        $this->assertSame(1, $prep['people']);
        $this->assertSame(['done' => 1, 'total' => 2], ['done' => $prep['done'], 'total' => $prep['total']]);
        $this->assertTrue($prep['urgent']);
        $this->assertSame(3, $prep['next_in_days']);
        $this->assertSame(0, $prep['started']);

        $tile = collect($this->actingAs($this->userWith(['employees.view']))
            ->getJson('/api/reports/r/employees.overview/rows?from=2026-01-01&to=2026-10-31')->json('summary'))->keyBy('key')['eo_preparing'];
        $this->assertSame(50, $tile['progress']);
        $this->assertNull($tile['share'], 'a bar without a badge');
        $this->assertSame('amber', $tile['attention']);
        $this->assertSame('rep_n_eo_prep_next', $tile['note']['label_key']);
    }

    public function test_a_start_more_than_a_week_ahead_is_not_urgent(): void
    {
        $later = $this->employee('Later', ['joined_at' => '2026-10-28']);
        $this->onboarding($later, 'approved');

        $prep = $this->breakdown()['prep'];

        $this->assertFalse($prep['urgent']);
        $this->assertSame(15, $prep['next_in_days']);
    }

    public function test_leavers_holding_access_ignore_the_range_but_follow_the_department(): void
    {
        $it = Department::create(['code' => 'IT', 'name' => 'IT']);
        $hr = Department::create(['code' => 'HR', 'name' => 'HR']);
        $gone = $this->employee('Gone', ['department_id' => $it->id, 'status' => 'resigned', 'last_day' => '2025-06-30']);
        $lastDayToday = $this->employee('Today', ['department_id' => $it->id, 'status' => 'resigned', 'last_day' => '2026-10-13']);
        $other = $this->employee('Other', ['department_id' => $hr->id, 'status' => 'resigned', 'last_day' => '2026-09-01']);
        foreach ([$gone, $lastDayToday, $other] as $e) {
            $this->grant($e, 'All '.$e->code);
        }
        $this->grant($gone, 'Revoked', '2025-07-01 00:00:00');

        $all = $this->breakdown()['holding'];
        $itOnly = $this->breakdown('&department_id='.$it->id)['holding'];

        $this->assertSame(2, $all['people']); // Gone (last year) + Other; Today still works today
        $this->assertSame([$gone->code, $other->code], array_column(array_column($all['rows'], 'employee'), 'code'));
        $this->assertSame(1, $itOnly['people']);
        $this->assertSame(1, $itOnly['by_type']['email_group']);
        $this->assertSame($gone->code, $itOnly['rows'][0]['employee']['code']);
        $this->assertSame([['type' => 'email_group', 'name' => 'All '.$gone->code]], $itOnly['rows'][0]['grants']);
        $this->assertSame(470, $itOnly['rows'][0]['days_out']);
    }

    public function test_department_table_has_sections_unassigned_and_empty_departments(): void
    {
        $prod = Department::create(['code' => 'PRD', 'name' => 'Production']);
        Department::create(['code' => 'EMP', 'name' => 'Empty']);
        $line = Section::create(['code' => 'L1', 'department_id' => $prod->id, 'name' => 'Line 1']);
        Section::create(['code' => 'L2', 'department_id' => $prod->id, 'name' => 'Line 2']);
        $this->employee('A', ['department_id' => $prod->id, 'section_id' => $line->id, 'joined_at' => '2020-01-01']);
        $this->employee('B', ['department_id' => $prod->id, 'section_id' => $line->id, 'joined_at' => '2026-05-01']);
        $this->employee('NoDept', ['joined_at' => '2020-01-01']);

        $data = $this->breakdown();
        $rows = collect($data['departments'])->keyBy(fn (array $d) => $d['name'] ?? 'none');

        $this->assertSame(['start' => 1, 'joined' => 1, 'left' => 0, 'end' => 2], array_intersect_key($rows['Production'], array_flip(['start', 'joined', 'left', 'end'])));
        $this->assertSame(['Line 1'], array_column($rows['Production']['sections'], 'name'));
        $this->assertSame(1, $rows['Production']['hidden_sections']);
        $this->assertNull($rows['none']['id']);
        $this->assertSame(1, $rows['none']['end']);
        $this->assertSame(['Empty'], array_column($data['empty_departments'], 'name'));
        $this->assertSame(['start' => 2, 'joined' => 1, 'left' => 0, 'end' => 3], $data['total']);

        $filtered = $this->breakdown('&department_id='.$prod->id);
        $this->assertSame(['Production'], array_column($filtered['departments'], 'name'));
        $this->assertSame(2, $filtered['total']['end']);
    }

    public function test_access_link_flag_follows_the_access_report_permission(): void
    {
        $plain = $this->userWith(['employees.view']);
        $both = $this->userWith(['employees.view', 'access.overview']);

        $this->assertFalse($this->actingAs($plain)->getJson('/api/reports/employees/overview/breakdown')->json('data.can_open_access'));
        $this->assertTrue($this->actingAs($both)->getJson('/api/reports/employees/overview/breakdown')->json('data.can_open_access'));
    }
}
