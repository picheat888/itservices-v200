<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ภาพรวมคำขอ" (requests.overview): the request rows, the tiles with their trends and the
 * previous-period guard, and the breakdown endpoint (months, types, days to delivery, items, departments).
 */
class RequestOverviewReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $seq = 0;

    private Department $prod;

    private Department $qc;

    /** @var array<string, ServiceRequest> */
    private array $r = [];

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $this->prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $this->qc = Department::create(['name' => 'Quality', 'name_th' => 'ฝ่ายควบคุมคุณภาพ', 'tag' => 'QC']);
        $person = fn (string $code, Department $d) => Employee::create(['code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d->id]);
        $a = $person('EMP-A', $this->prod);
        $b = $person('EMP-B', $this->qc);
        $newcomer = $person('EMP-N', $this->prod);

        $option = fn (string $type, string $en, string $th) => RequestOption::create(['request_type' => $type, 'field_key' => 'device_id', 'label_en' => $en, 'label_th' => $th]);
        $laptop = $option('computer', 'Laptop', 'โน้ตบุ๊ก');
        $desktop = $option('computer', 'Desktop PC', 'คอมพิวเตอร์ตั้งโต๊ะ');
        $phone = $option('mobile', 'Smartphone', 'สมาร์ตโฟน');
        $autocad = Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 10]);
        $share = FileShare::create(['name' => 'QC Docs', 'path' => '\\\\fs\\qc', 'department_id' => $this->qc->id]);

        // Submitted before the range: only its completion (in January) is counted, in the month card.
        $this->r['old'] = $this->request('computer', 'completed', '2025-12-20 09:00', $a, [
            'approved_at' => '2025-12-22 09:00', 'completed_at' => '2026-01-03 09:00',
        ]);
        $this->r['done'] = $this->request('computer', 'completed', '2026-09-01 09:00', $a, [
            'approved_at' => '2026-09-02 08:00', 'completed_at' => '2026-09-04 17:00', 'request_option_id' => $laptop->id,
        ]);
        // Across midnight: approved the same day (0), completed the next (1).
        $this->r['midnight'] = $this->request('computer', 'completed', '2026-09-10 23:50', $newcomer, [
            'origin' => 'onboarding', 'approved_at' => '2026-09-10 23:55', 'completed_at' => '2026-09-11 00:10', 'request_option_id' => $laptop->id,
        ]);
        $this->r['waiting_old'] = $this->request('email', 'pending', '2026-09-10 09:00', $newcomer, ['origin' => 'onboarding']);
        $this->r['waiting_new'] = $this->request('software', 'pending', '2026-09-20 10:00', $b, ['software_id' => $autocad->id]);
        $this->r['approved'] = $this->request('computer', 'approved', '2026-09-20 08:00', $b, [
            'approved_at' => '2026-09-21 09:00', 'request_option_id' => $desktop->id,
        ]);
        $this->r['rejected'] = $this->request('fileshare', 'rejected', '2026-08-05 09:00', $b, [
            'rejected_at' => '2026-08-06 09:00', 'file_share_id' => $share->id,
        ]);
        $this->r['cancel_reason'] = $this->request('mobile', 'cancelled', '2026-07-01 09:00', $a, [
            'approved_at' => '2026-07-02 09:00', 'cancelled_at' => '2026-07-03 09:00', 'request_option_id' => $phone->id,
            'cancel_reason' => 'ไม่ต้องใช้แล้ว', 'cancelled_by_name' => 'Somchai',
        ]);
        $this->r['cancel_plain'] = $this->request('mobile', 'cancelled', '2026-07-05 09:00', $a, ['cancelled_at' => '2026-07-05 11:00']);
    }

    /** @param array<string, mixed> $extra */
    private function request(string $type, string $status, string $createdAt, Employee $employee, array $extra = []): ServiceRequest
    {
        $this->seq++;
        $request = ServiceRequest::create(array_merge([
            'reference' => sprintf('RQ-2026-%04d', $this->seq), 'type' => $type, 'origin' => 'direct', 'employee_id' => $employee->id,
            'requester_name' => $employee->name, 'title' => "Request {$this->seq}", 'reason' => 'Needed for work.', 'status' => $status,
        ], $extra));
        ServiceRequest::query()->whereKey($request->id)->update(['created_at' => $createdAt]);

        return $request->fresh();
    }

    /** @param list<string> $permissions */
    private function userWith(?array $permissions = null): User
    {
        $permissions ??= $this->reportRights('requests');
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return array<string, mixed> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/tabular/requests.overview/rows'.$query)->assertOk()->json();
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/requests/overview/breakdown'.$query)->assertOk()->json('data');
    }

    public function test_rows_list_the_range_newest_first_with_whole_days(): void
    {
        $body = $this->rows();
        $rows = collect($body['data'])->keyBy('id');

        $this->assertSame(8, $body['meta']['total']);
        $this->assertSame(
            ['waiting_new', 'approved', 'midnight', 'waiting_old', 'done', 'rejected', 'cancel_plain', 'cancel_reason'],
            array_map(fn (int $id) => array_search($id, array_map(fn (ServiceRequest $r) => $r->id, $this->r), true), array_column($body['data'], 'id')),
        );

        $midnight = $rows[$this->r['midnight']->id];
        $this->assertSame('2026-09-10', $midnight['submitted_at']);
        $this->assertSame('onboarding', $midnight['origin']);
        $this->assertSame('ฝ่ายผลิต', $midnight['department']['name_th']);
        $this->assertSame('EMP-N', $midnight['employee_code']);
        $this->assertEquals(1, $midnight['total_days']);
        $this->assertNull($midnight['open_days']);
        $this->assertSame('/requests?view='.$this->r['midnight']->id, $midnight['_links']['request_no']);

        $this->assertEquals(3, $rows[$this->r['done']->id]['total_days']);
        $this->assertEquals(15, $rows[$this->r['waiting_old']->id]['open_days']);
        $this->assertEquals(5, $rows[$this->r['approved']->id]['open_days']);
        $this->assertNull($rows[$this->r['rejected']->id]['open_days']);
        $this->assertNull($rows[$this->r['rejected']->id]['total_days']);
        // Sheet-only columns stay off the page rows.
        $this->assertArrayNotHasKey('cancel_reason', $midnight);
    }

    public function test_tiles_count_the_range(): void
    {
        $tiles = collect($this->rows()['summary'])->keyBy('key');

        $this->assertSame(8, $tiles['rqo_total']['value']);
        $this->assertSame(['completed' => 2, 'open' => 3, 'closed' => 3], array_column($tiles['rqo_total']['split'], 'value', 'key'));

        $this->assertSame(2, $tiles['rqo_pending']['value']);
        $this->assertSame('amber', $tiles['rqo_pending']['attention']);
        // Trend tiles carry only their trend.
        foreach (['rqo_pending', 'rqo_rejected', 'rqo_lead'] as $key) {
            $this->assertSame(['label_key', 'trend'], array_keys($tiles[$key]['note']));
            $this->assertSame($tiles[$key]['note']['trend']['label_key'], $tiles[$key]['note']['label_key']);
        }

        $this->assertSame(2, $tiles['rqo_completed']['value']);
        $this->assertSame(25, $tiles['rqo_completed']['share']);
        $this->assertSame(1, $tiles['rqo_completed']['note']['values']['n']);

        $this->assertSame(1, $tiles['rqo_rejected']['value']);

        // Completed: 3 and 1 days submitted to completed.
        $this->assertEquals(2, $tiles['rqo_lead']['value']);
        $this->assertSame('days', $tiles['rqo_lead']['format']);
    }

    public function test_pending_trend_reconstructs_the_last_eight_weeks(): void
    {
        $trend = collect($this->rows()['summary'])->keyBy('key')['rqo_pending']['note']['trend'];

        // Week ends 7 Aug … 25 Sep: one waiting from 10 Sep, a second from 20 Sep.
        $this->assertSame([0, 0, 0, 0, 0, 1, 1, 2], $trend['points']);
        $this->assertSame('up', $trend['direction']);
        $this->assertSame('rep_req_trend_since_7d', $trend['label_key']);
        $this->assertEquals(['delta' => 1], $trend['values']);
        $this->assertFalse($trend['up_is_good']);
    }

    public function test_period_trends_hide_the_change_when_the_previous_period_starts_before_the_first_request(): void
    {
        // Range 1 Jan – 25 Sep (268 days): the previous period starts 8 Apr 2025, before the first request (20 Dec 2025).
        $tiles = collect($this->rows()['summary'])->keyBy('key');

        foreach (['rqo_rejected', 'rqo_lead'] as $key) {
            $trend = $tiles[$key]['note']['trend'];
            $this->assertSame('rep_req_trend_no_base', $trend['label_key']);
            $this->assertSame('even', $trend['direction']);
            $this->assertSame([], $trend['values']);
        }
        $this->assertSame([0, 0, 0, 0, 0, 0, 0, 1, 0], $tiles['rqo_rejected']['note']['trend']['points']);
        $this->assertSame([null, null, null, null, null, null, null, null, 2], $tiles['rqo_lead']['note']['trend']['points']);
    }

    public function test_period_trends_compare_when_the_previous_period_is_covered(): void
    {
        // An earlier first request makes the previous period (8 Apr – 31 Dec 2025) fair: it holds the December request.
        $this->request('other', 'rejected', '2025-03-01 09:00', Employee::where('code', 'EMP-A')->firstOrFail(), ['rejected_at' => '2025-03-02 09:00']);
        $tiles = collect($this->rows()['summary'])->keyBy('key');

        $rejected = $tiles['rqo_rejected']['note']['trend'];
        $this->assertSame('rep_req_trend_prev', $rejected['label_key']);
        $this->assertEquals(['up', ['delta' => 1]], [$rejected['direction'], $rejected['values']]);

        // 2 days now against 14 (20 Dec → 3 Jan) before.
        $lead = $tiles['rqo_lead']['note']['trend'];
        $this->assertEquals(['down', ['delta' => 12]], [$lead['direction'], $lead['values']]);
    }

    public function test_previous_period_guard_is_by_date(): void
    {
        // 20 days from 9 Jan: the previous period starts on 20 Dec, the first request's own date.
        $fair = collect($this->rows('?from=2026-01-09&to=2026-01-28')['summary'])->keyBy('key');
        $this->assertSame('rep_req_trend_prev', $fair['rqo_rejected']['note']['trend']['label_key']);

        // One day longer: it starts on 18 Dec, before any request.
        $unfair = collect($this->rows('?from=2026-01-08&to=2026-01-28')['summary'])->keyBy('key');
        $this->assertSame('rep_req_trend_no_base', $unfair['rqo_rejected']['note']['trend']['label_key']);
    }

    public function test_breakdown_months_types_and_delivery(): void
    {
        $data = $this->breakdown();

        $months = collect($data['months'])->keyBy('month');
        $this->assertCount(9, $months);
        $this->assertSame(['submitted' => 0, 'completed' => 1], array_intersect_key($months['2026-01'], ['submitted' => 0, 'completed' => 0]));
        $this->assertSame(2, $months['2026-07']['submitted']);
        $this->assertSame(5, $months['2026-09']['submitted']);
        $this->assertSame(2, $months['2026-09']['completed']);

        $this->assertSame(['computer', 'mobile', 'email', 'fileshare', 'software'], array_column($data['types'], 'type'));
        $computer = $data['types'][0];
        $this->assertSame(3, $computer['total']);
        $this->assertSame(['pending' => 0, 'approved' => 1, 'completed' => 2, 'rejected' => 0, 'cancelled' => 0], $computer['by_status']);
        $this->assertSame([3, 0], [$computer['approved'], $computer['rejected']]);
        $this->assertSame([0, 1], [$data['types'][3]['approved'], $data['types'][3]['rejected']]);
        $this->assertSame(1, $data['types'][1]['approved']);

        $this->assertSame([['type' => 'computer', 'count' => 2, 'approval' => 0.5, 'it' => 1.5, 'total' => 2]], $data['delivery']['types']);
        $this->assertSame(['count' => 2, 'approval' => 0.5, 'it' => 1.5, 'total' => 2], $data['delivery']['all']);
    }

    public function test_breakdown_items_by_origin_and_departments(): void
    {
        $data = $this->breakdown();

        $items = $data['items'];
        $this->assertSame(['all' => 8, 'direct' => 6, 'onboarding' => 2], $items['origins']);
        $this->assertSame(1, $items['people']);
        $this->assertSame(['all' => 6, 'direct' => 5, 'onboarding' => 1], $items['picked']);
        $onboarding = array_values(array_filter($items['list'], fn (array $i) => $i['origin'] === 'onboarding'));
        $this->assertSame([['origin' => 'onboarding', 'type' => 'computer', 'kind' => 'option', 'name' => 'Laptop', 'name_th' => 'โน้ตบุ๊ก', 'count' => 1]],
            array_map(fn (array $i) => array_diff_key($i, ['id' => 0]), $onboarding));
        $this->assertContains('AutoCAD', array_column($items['list'], 'name'));
        $this->assertContains('QC Docs', array_column($items['list'], 'name'));

        [$prod, $qc] = $data['departments'];
        $this->assertSame(['ฝ่ายผลิต', 5, 2], [$prod['name_th'], $prod['total'], $prod['onboarding']]);
        $this->assertSame(['hardware' => 4, 'software' => 1, 'network' => 0, 'cctv' => 0, 'telephone' => 0, 'other' => 0], $prod['by_category']);
        // Computer and mobile both 2: the earlier type in the module's order wins, one ties with it.
        $this->assertSame(['type' => 'computer', 'count' => 2, 'ties' => 1], $prod['top_type']);
        $this->assertSame(['hardware' => 1, 'software' => 1, 'network' => 1], array_slice($qc['by_category'], 0, 3));
        $this->assertSame(['type' => 'computer', 'count' => 1, 'ties' => 2], $qc['top_type']);
        $this->assertSame(0, $qc['onboarding']);
    }

    public function test_filters_narrow_rows_tiles_and_cards(): void
    {
        $this->assertSame(3, $this->rows('?type=computer')['meta']['total']);
        $this->assertSame(3, $this->rows('?department_id='.$this->qc->id)['meta']['total']);
        $this->assertSame(['computer'], array_column($this->breakdown('?department_id='.$this->qc->id.'&type=computer')['types'], 'type'));

        $completedOnly = collect($this->rows('?status=completed')['summary'])->keyBy('key');
        $this->assertSame(2, $completedOnly['rqo_total']['value']);
        $this->assertSame(0, $completedOnly['rqo_pending']['value']);
        $this->assertSame(array_fill(0, 8, 0), $completedOnly['rqo_pending']['note']['trend']['points']);

        $pendingOnly = collect($this->rows('?status=pending')['summary'])->keyBy('key');
        $this->assertSame([0, 0, 0, 0, 0, 1, 1, 2], $pendingOnly['rqo_pending']['note']['trend']['points']);
    }

    public function test_an_empty_range_gives_empty_cards(): void
    {
        $data = $this->breakdown('?from=2026-03-01&to=2026-03-31');

        $this->assertSame([['month' => '2026-03', 'submitted' => 0, 'completed' => 0]], $data['months']);
        $this->assertSame([], $data['types']);
        $this->assertSame(['count' => 0, 'approval' => null, 'it' => null, 'total' => null], $data['delivery']['all']);
        $this->assertSame([], $data['items']['list']);
        $this->assertSame([], $data['departments']);

        $tiles = collect($this->rows('?from=2026-03-01&to=2026-03-31')['summary'])->keyBy('key');
        $this->assertSame(0, $tiles['rqo_total']['value']);
        $this->assertNull($tiles['rqo_lead']['value']);
        // Waiting for approval is counted as of today, not by the range.
        $this->assertSame(2, $tiles['rqo_pending']['value']);
    }

    public function test_pending_is_a_now_figure_whatever_the_range(): void
    {
        // Both waiting requests were submitted before 21 Sep; the tile still counts them and its weeks are full.
        $pending = collect($this->rows('?from=2026-09-21&to=2026-09-25')['summary'])->keyBy('key')['rqo_pending'];

        $this->assertSame(2, $pending['value']);
        $this->assertSame([0, 0, 0, 0, 0, 1, 1, 2], $pending['note']['trend']['points']);
        $this->assertEquals(['delta' => 1], $pending['note']['trend']['values']);

        // The department filter still applies.
        $qc = collect($this->rows('?from=2026-09-21&to=2026-09-25&department_id='.$this->qc->id)['summary'])->keyBy('key')['rqo_pending'];
        $this->assertSame([1, [0, 0, 0, 0, 0, 0, 0, 1]], [$qc['value'], $qc['note']['trend']['points']]);
    }

    public function test_pending_needs_more_than_seven_whole_days_for_attention(): void
    {
        // 17 Sep: the oldest has waited exactly 7 days (the 20 Sep one is not submitted yet).
        $this->travelTo('2026-09-17 10:00:00');
        $this->assertNull(collect($this->rows()['summary'])->keyBy('key')['rqo_pending']['attention']);

        $this->travelTo('2026-09-18 10:00:00');
        $this->assertSame('amber', collect($this->rows()['summary'])->keyBy('key')['rqo_pending']['attention']);
    }

    public function test_a_request_without_its_employee_row_falls_back_to_its_written_department(): void
    {
        $orphan = $this->request('network', 'pending', '2026-09-22 09:00', Employee::where('code', 'EMP-B')->firstOrFail(), ['department_name' => 'Quality']);
        ServiceRequest::query()->whereKey($orphan->id)->update(['employee_id' => null]);

        $rows = collect($this->rows('?department_id='.$this->qc->id)['data'])->keyBy('id');
        $this->assertCount(4, $rows);
        $this->assertSame(['name' => 'Quality', 'name_th' => null], $rows[$orphan->id]['department']);

        // Joins QC's row: the share request plus this network one make 2 in network.
        $qc = collect($this->breakdown()['departments'])->firstWhere('department_id', $this->qc->id);
        $this->assertSame([4, 'ฝ่ายควบคุมคุณภาพ', 2], [$qc['total'], $qc['name_th'], $qc['by_category']['network']]);
    }

    public function test_the_report_needs_view_all(): void
    {
        $submitter = $this->userWith(['requests.submit', 'requests.complete']);

        $this->actingAs($submitter)->getJson('/api/reports/tabular/requests.overview/rows')->assertForbidden();
        $this->actingAs($submitter)->getJson('/api/reports/requests/overview/breakdown')->assertForbidden();
    }

    public function test_pdf_export_renders(): void
    {
        $response = $this->actingAs($this->userWith())->exportReport('/api/reports/tabular/requests.overview/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    public function test_xlsx_carries_the_cards_and_the_cancel_reason(): void
    {
        Excel::fake();
        // IT closed the case without delivering: the request row has no reason, the completion step does.
        $notDelivered = $this->request('cctv', 'cancelled', '2026-09-03 09:00', Employee::where('code', 'EMP-A')->firstOrFail(), [
            'approved_at' => '2026-09-04 09:00', 'cancelled_at' => '2026-09-08 09:00',
        ]);
        RequestApproval::create([
            'service_request_id' => $notDelivered->id, 'position' => 2, 'actor_type' => 'it_staff', 'kind' => 'completion', 'label' => 'IT',
            'status' => 'rejected', 'became_current_at' => '2026-09-04 09:00', 'acted_at' => '2026-09-08 09:00',
            'acted_by_name' => 'IT Desk', 'note' => 'ไม่มีอุปกรณ์ในสต็อก',
        ]);

        $this->actingAs($this->userWith())->exportReport('/api/reports/tabular/requests.overview/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_requests-overview_2026-09-25.xlsx', function (TabularReportExport $export) use ($notDelivered) {
            $sheets = $export->sheets();
            $rows = end($sheets);
            $headings = $rows->headings();
            $byReference = $export->rows->keyBy('reference');
            $cell = fn (ServiceRequest $r, string $heading) => $rows->map($byReference[$r->reference])[array_search($heading, $headings, true)];
            $cancel = fn (ServiceRequest $r) => [$cell($r, 'ผู้ยกเลิก'), $cell($r, 'เหตุผลที่ยกเลิก')];

            return count($sheets) === 7
                && in_array('คอมพิวเตอร์', $rows->map($byReference[$this->r['done']->reference]), true)
                && $cancel($this->r['cancel_reason']) === ['Somchai', 'ไม่ต้องใช้แล้ว']
                && $cancel($this->r['cancel_plain']) === [null, null]
                && $cancel($notDelivered) === ['IT Desk', 'ไม่มีอุปกรณ์ในสต็อก'];
        });
    }
}
