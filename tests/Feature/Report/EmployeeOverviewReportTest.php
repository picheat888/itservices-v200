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
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ภาพรวมพนักงาน" (employees.overview): the joiner and leaver rows, and the breakdown behind its tiles,
 * headcount chart, department table and leavers still holding access.
 */
class EmployeeOverviewReportTest extends TestCase
{
    use GrantsReports;
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
        return $this->actingAs($this->userWith([...$this->reportRights('employees')]))
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
        $user = $this->userWith([...$this->reportRights('employees')]);

        $rows = $this->actingAs($user)->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data');

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

        $rows = collect($this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data'))
            ->keyBy('movement_kind');

        $this->assertSame(1, $rows['left']['open_grants']);
        $this->assertSame(0, $rows['left']['assets_held']);
        $this->assertSame('preparing', $rows['joined']['prep_status']);
        $this->assertSame('1/2', $rows['joined']['onboarding']);
        $this->assertSame(-12, $rows['joined']['upcoming_days']);
        $this->assertNull($rows['joined']['open_grants']);
    }

    public function test_file_carries_periods_departments_and_access_holders(): void
    {
        $this->employee('OneDay', ['joined_at' => '2026-06-01', 'status' => 'resigned', 'last_day' => '2026-06-01']);
        $report = ReportCatalogue::tabular('employees.overview');
        $filters = $report->resolveFilters(['from' => '2026-01-01', 'to' => '2026-10-31']);

        $sections = $report->exportSections($this->userWith([...$this->reportRights('employees')]), $filters);

        $this->assertCount(3, $sections);
        $this->assertSame(1, array_sum(array_column($sections[0]['rows'], 3)));
        $this->assertSame(1, array_sum(array_column($sections[0]['rows'], 4)));
        $total = end($sections[1]['rows']);
        $this->assertSame('รวม', $total[0]);
        $this->assertSame($total[1] + $total[2] - $total[3], $total[4]);
        $this->assertStringContainsString('ไม่ขึ้นกับช่วงวันที่', $sections[2]['title']);
    }

    public function test_same_day_join_and_leave_is_two_rows_and_counts_in_both(): void
    {
        $this->employee('OneDay', ['joined_at' => '2026-06-01', 'status' => 'resigned', 'last_day' => '2026-06-01']);

        $rows = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data');
        $data = $this->breakdown();

        $this->assertSame(['joined', 'left'], array_column($rows, 'movement_kind'));
        $this->assertSame(1, $data['joiners']['started']);
        $this->assertSame(1, $data['leavers']['count']);
    }

    public function test_kind_filter_narrows_the_rows_only(): void
    {
        $this->employee('Joiner', ['joined_at' => '2026-03-02']);
        $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-05-31']);
        $user = $this->userWith([...$this->reportRights('employees')]);

        $body = $this->actingAs($user)->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31&kind=left')->assertOk()->json();

        $this->assertSame(['left'], array_values(array_unique(array_column($body['data'], 'movement_kind'))));
        $tiles = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $tiles['eo_joined']['value'], 'the tiles ignore the kind filter');
        $this->assertSame(1, $tiles['eo_left']['value']);
        $this->assertSame('bad', $tiles['eo_left']['chart']['tone']);
    }

    public function test_overview_needs_employees_view(): void
    {
        $this->actingAs($this->userWith([...$this->reportRights('assets')]))->getJson('/api/reports/tabular/employees.overview/rows')->assertForbidden();
        $this->actingAs($this->userWith([...$this->reportRights('assets')]))->getJson('/api/reports/employees/overview/breakdown')->assertForbidden();
    }

    public function test_old_key_is_gone(): void
    {
        $this->actingAs($this->userWith([...$this->reportRights('employees')]))->getJson('/api/reports/tabular/employees.joiners_leavers/rows')->assertNotFound();
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
        // No start date is never counted as working; resigned without a last day leaves yesterday.
        $this->assertSame(4, $data['headcount']['start']); // Stay, Leaver, NoticeGiven, LeftLongAgo
        $this->assertSame(3, $data['headcount']['end']);   // Stay, Joiner, NoticeGiven
        $this->assertSame(['started' => 2, 'upcoming' => 1], $data['joiners']);
        $this->assertSame(4, $data['leavers']['count']);   // Leaver, Both, NoticeGiven, LeftLongAgo
        $this->assertSame(114.3, (float) $data['leavers']['rate']);
        $this->assertSame(1, $data['leavers']['still_working']);
    }

    public function test_nobody_at_all_gives_no_rate_and_no_nan(): void
    {
        $body = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json();
        $data = $this->breakdown();

        $this->assertNull($data['leavers']['rate']);
        $this->assertSame(['start' => 0, 'end' => 0], $data['headcount']);
        $this->assertSame('—', collect($body['summary'])->keyBy('key')['eo_left']['note']['texts']['rate']);
    }

    public function test_the_leavers_tile_compares_turnover_with_the_period_before(): void
    {
        foreach (range(1, 9) as $i) {
            $this->employee("Stay{$i}", ['joined_at' => '2020-01-01']);
        }
        $this->employee('LeftBefore', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-05-15']);
        $this->employee('LeftNow1', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-07-15']);
        $this->employee('LeftNow2', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-08-15']);

        $body = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-07-01&to=2026-09-30')->assertOk()->json();
        $trend = collect($body['summary'])->keyBy('key')['eo_left']['note']['trend'];

        // Now: 2 left of (11 + 9) / 2 = 20.0%; Apr–Jun: 1 left of (12 + 11) / 2 = 8.7%.
        $this->assertSame('up', $trend['direction']);
        $this->assertEquals(11.3, $trend['values']['delta']);
        $this->assertFalse($trend['up_is_good']);
        $this->assertSame('rep_req_trend_prev', $trend['label_key']);
    }

    public function test_no_turnover_before_says_there_is_nothing_to_compare(): void
    {
        $this->employee('Joiner', ['joined_at' => '2026-07-01']);

        $body = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-07-01&to=2026-09-30')->assertOk()->json();
        $trend = collect($body['summary'])->keyBy('key')['eo_left']['note']['trend'];

        $this->assertSame('even', $trend['direction']);
        $this->assertSame('rep_req_trend_no_base', $trend['label_key']);
    }

    public function test_swapped_range_and_future_end_use_today(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);

        $data = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/overview/breakdown?from=2027-12-31&to=2026-01-01')->assertOk()->json('data');

        $this->assertSame('2026-10-13', $data['as_of']);
        $this->assertSame(1, $data['headcount']['end']);
        $this->assertSame('2026-01-01', $data['from']);
    }

    public function test_a_range_wholly_ahead_has_no_chart_points(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);

        $data = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/overview/breakdown?from=2027-01-01&to=2027-03-31')->assertOk()->json('data');

        $this->assertSame([], $data['points']);
        $this->assertSame('2027-01-01', $data['as_of']);
    }

    public function test_long_ranges_bucket_by_quarter_then_year(): void
    {
        $this->employee('Stay', ['joined_at' => '2010-01-01']);
        $user = $this->userWith([...$this->reportRights('employees')]);

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

    public function test_a_leaver_on_the_range_end_is_not_on_the_chart(): void
    {
        $this->employee('Stay', ['joined_at' => '2020-01-01']);
        $this->employee('LastOnEnd', ['joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-09-30']);
        $data = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/overview/breakdown?from=2026-01-01&to=2026-09-30')->assertOk()->json('data');

        $september = collect($data['points'])->last();

        $this->assertSame(2, $september['headcount']);
        $this->assertSame(0, $september['left']);
        $this->assertSame(1, $data['leavers']['count']);
    }

    public function test_department_rows_add_up_while_a_leaver_still_works(): void
    {
        $it = Department::create(['code' => 'IT', 'name' => 'IT']);
        $this->employee('Stay', ['department_id' => $it->id, 'joined_at' => '2020-01-01']);
        $this->employee('Notice', ['department_id' => $it->id, 'joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-10-25']);
        $this->employee('Gone', ['department_id' => $it->id, 'joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-05-31']);

        $data = $this->breakdown();
        $row = collect($data['departments'])->firstWhere('name', 'IT');

        $this->assertSame(['start' => 3, 'joined' => 0, 'left' => 1, 'end' => 2], array_intersect_key($row, array_flip(['start', 'joined', 'left', 'end'])));
        $this->assertSame($row['start'] + $row['joined'] - $row['left'], $row['end']);
        $this->assertSame(1, $data['leavers']['still_working']);
        $this->assertSame(2, $data['leavers']['count']);
    }

    public function test_resigners_without_a_last_day_or_with_one_before_the_start_keep_every_row_adding_up(): void
    {
        $it = Department::create(['code' => 'IT', 'name' => 'IT']);
        $hr = Department::create(['code' => 'HR', 'name' => 'HR']);
        $line = Section::create(['code' => 'L1', 'department_id' => $it->id, 'name' => 'Line 1']);
        $this->employee('Stay', ['department_id' => $it->id, 'section_id' => $line->id, 'joined_at' => '2020-01-01']);
        $noLastDay = $this->employee('NoLastDay', ['department_id' => $it->id, 'section_id' => $line->id, 'joined_at' => '2026-03-01', 'status' => 'resigned']);
        $longGone = $this->employee('LongGone', ['department_id' => $it->id, 'joined_at' => '2015-01-01', 'status' => 'resigned']);
        $badDates = $this->employee('BadDates', ['department_id' => $hr->id, 'joined_at' => '2026-04-01', 'status' => 'resigned', 'last_day' => '2026-03-15']);
        $this->employee('Leaver', ['department_id' => $hr->id, 'joined_at' => '2020-01-01', 'status' => 'resigned', 'last_day' => '2026-06-30']);

        $data = $this->breakdown();
        $adds = fn (array $r) => $r['end'] === $r['start'] + $r['joined'] - $r['left'];
        $counts = fn (array $r) => array_intersect_key($r, array_flip(['start', 'joined', 'left', 'end']));
        $rows = collect($data['departments'])->keyBy('name');

        foreach ($data['departments'] as $row) {
            $this->assertTrue($adds($row), "{$row['name']}: ".json_encode($counts($row)));
            foreach ($row['sections'] as $section) {
                $this->assertTrue($adds($section), "{$row['name']} / {$section['name']}: ".json_encode($counts($section)));
            }
        }
        $this->assertTrue($adds($data['total']), json_encode($data['total']));
        // NoLastDay and LongGone leave yesterday; BadDates leaves on the start day.
        $this->assertSame(['start' => 2, 'joined' => 1, 'left' => 2, 'end' => 1], $counts($rows['IT']));
        $this->assertSame(['start' => 1, 'joined' => 1, 'left' => 2, 'end' => 0], $counts($rows['HR']));
        $this->assertSame(4, $data['leavers']['count']);
        foreach ($data['points'] as $point) {
            $this->assertSame($point['base'] + $point['joined'] - $point['left'], $point['headcount'], $point['end']);
        }
        $badEvent = collect($data['points'])->pluck('events')->flatten(1)->first(fn (array $e) => $e['kind'] === 'left' && $e['id'] === $badDates->id);
        $this->assertSame(['date' => '2026-03-15', 'before_start' => true], ['date' => $badEvent['date'], 'before_start' => $badEvent['before_start']]);

        // The list shows the same leavers as the tile, without a last day where none is recorded.
        $body = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31&kind=left')->assertOk()->json();
        $left = collect($body['data'])->keyBy('employee_code');
        $this->assertCount(4, $left);
        $this->assertSame(4, collect($body['summary'])->keyBy('key')['eo_left']['value']);
        $this->assertNull($left[$noLastDay->code]['last_day']);
        $this->assertNull($left[$longGone->code]['last_day']);
    }

    public function test_leavers_holding_access_match_the_open_items_report_with_no_last_day_last(): void
    {
        $noLastDay = $this->employee('NoLastDay', ['code' => 'EMP-1', 'status' => 'resigned']);
        $ten = $this->employee('Ten', ['code' => 'EMP-10', 'status' => 'resigned', 'last_day' => '2026-09-01']);
        $nine = $this->employee('Nine', ['code' => 'EMP-9', 'status' => 'resigned', 'last_day' => '2026-09-01']);
        $oldest = $this->employee('Oldest', ['code' => 'EMP-50', 'status' => 'resigned', 'last_day' => '2026-01-01']);
        foreach ([$noLastDay, $ten, $nine, $oldest] as $e) {
            $this->grant($e, 'All '.$e->code);
        }

        $response = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/overview/breakdown?from=2026-01-01&to=2026-10-31')->assertOk();
        $holding = $response->json('data.holding');
        $openItems = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/open-items/breakdown')->assertOk();

        $order = [$oldest->code, $nine->code, $ten->code, $noLastDay->code];
        $this->assertSame($order, array_column(array_column($holding['rows'], 'employee'), 'code'));
        $this->assertSame($order, array_column($openItems->json('data.access.rows'), 'code'));
        $this->assertSame(array_column($openItems->json('data.access.rows'), 'days_out'), array_column($holding['rows'], 'days_out'));
        $this->assertNull($holding['rows'][3]['days_out']);
        $this->assertSame(['people' => 4, 'grants' => 4], ['people' => $holding['people'], 'grants' => $holding['grants']]);
        $this->assertArrayNotHasKey('left_total', $holding);
        $this->assertSame('success', $response->json('message'));
        $this->assertSame('success', $openItems->json('message'));
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

        $tile = collect($this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->json('summary'))->keyBy('key')['eo_preparing'];
        $this->assertSame(50, $tile['progress']);
        $this->assertNull($tile['share'], 'a bar without a badge');
        $this->assertSame('amber', $tile['attention']);
        $this->assertSame('rep_n_eo_prep_next', $tile['note']['label_key']);
    }

    public function test_rejected_requests_stay_open_and_cancelled_ones_are_not_counted(): void
    {
        $rejected = $this->employee('Rejected', ['joined_at' => '2026-10-20']);
        $this->onboarding($rejected, 'rejected');
        $cancelled = $this->employee('Cancelled', ['joined_at' => '2026-10-21']);
        $this->onboarding($cancelled, 'cancelled');
        $completed = $this->employee('Completed', ['joined_at' => '2026-10-22']);
        $this->onboarding($completed, 'completed');
        $this->onboarding($completed, 'cancelled');

        $rows = collect($this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.overview/rows?from=2026-01-01&to=2026-10-31')->assertOk()->json('data'))
            ->keyBy('employee_code');
        $prep = $this->breakdown()['prep'];

        $this->assertSame(['preparing', '0/1'], [$rows[$rejected->code]['prep_status'], $rows[$rejected->code]['onboarding']]);
        $this->assertSame(['none', null], [$rows[$cancelled->code]['prep_status'], $rows[$cancelled->code]['onboarding']]);
        $this->assertSame(['ready', '1/1'], [$rows[$completed->code]['prep_status'], $rows[$completed->code]['onboarding']]);
        $this->assertSame(1, $prep['people']);
        $this->assertSame(['done' => 0, 'total' => 1], ['done' => $prep['done'], 'total' => $prep['total']]);
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
        $plain = $this->userWith([...$this->reportRights('employees')]);
        $both = $this->userWith([...$this->reportRights('employees', 'access')]);

        $this->assertFalse($this->actingAs($plain)->getJson('/api/reports/employees/overview/breakdown')->json('data.can_open_access'));
        $this->assertTrue($this->actingAs($both)->getJson('/api/reports/employees/overview/breakdown')->json('data.can_open_access'));
    }
}
