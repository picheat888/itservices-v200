<?php

namespace Tests\Feature\Report;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Request\RequestApprovalsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "การอนุมัติคำขอ" (requests.approvals): the step rows, the five tiles with their monthly trend and
 * previous-period guard, and the breakdown endpoint (waiting now, approvers, ended requests, skips).
 */
class RequestApprovalsReportTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    private int $seq = 0;

    /** @var array<string, ServiceRequest> */
    private array $r = [];

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
        $this->seedSteps();
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

    /** @param array<string, mixed> $extra */
    private function request(string $name, string $type, string $status, array $extra = []): ServiceRequest
    {
        $this->seq++;
        $created = $extra['created_at'] ?? null;
        unset($extra['created_at']);
        $request = ServiceRequest::create(array_merge([
            'reference' => sprintf('RQ-2026-%04d', $this->seq), 'type' => $type, 'origin' => 'direct',
            'requester_name' => "Requester {$name}", 'title' => "Request {$name}", 'reason' => 'Needed for work.', 'status' => $status,
        ], $extra));
        if ($created !== null) {
            ServiceRequest::query()->whereKey($request->id)->update(['created_at' => $created]);
        }

        return $this->r[$name] = $request->fresh();
    }

    /** @param array<string, mixed> $attributes */
    private function step(string $name, string $status, array $attributes = []): RequestApproval
    {
        return RequestApproval::create(array_merge([
            'service_request_id' => $this->r[$name]->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'status' => $status,
        ], $attributes));
    }

    private function seedSteps(): void
    {
        $production = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $safety = Department::create(['name' => 'Safety', 'name_th' => 'ฝ่ายความปลอดภัย', 'tag' => 'SE']);
        $manager = Position::create(['code' => 'P-MGR', 'title' => 'Manager']);
        $person = fn (string $code, string $first, array $extra = []) => Employee::create([
            'code' => $code, 'first_name' => $first, 'last_name' => 'Test', 'department_id' => $production->id, 'status' => 'active', ...$extra,
        ]);
        $anan = $person('EMP-1', 'Anan');
        $ananUser = User::factory()->create(['name' => 'Anan', 'employee_id' => $anan->id]);
        // Left on the 10th: can no longer sign in.
        $wichai = $person('EMP-2', 'Wichai', ['status' => 'resigned', 'last_day' => '2026-09-10']);
        User::factory()->create(['name' => 'Wichai', 'employee_id' => $wichai->id]);
        // Never given a login.
        $porn = $person('EMP-3', 'Porn', ['department_id' => $safety->id]);
        $noManager = $person('EMP-9', 'Mongkol');
        $admin = User::factory()->create(['name' => 'Administrator']);
        $byAnan = fn (string $became, string $acted, array $extra = []) => [
            'approver_employee_id' => $anan->id, 'approver_name' => 'Anan Test', 'acted_by_user_id' => $ananUser->id, 'acted_by_name' => 'Anan',
            'became_current_at' => $became, 'acted_at' => $acted, ...$extra,
        ];
        $groupNoOwner = EmailGroup::create(['code' => 'MG-1', 'name' => 'Ownerless Group', 'email' => 'none@x.co']);
        $groupOwned = EmailGroup::create(['code' => 'MG-2', 'name' => 'Owned Group', 'email' => 'owned@x.co', 'owner_employee_id' => $anan->id]);
        $share = FileShare::create(['code' => 'FS-1', 'name' => 'Own Share', 'path' => '\\\\fs\\own', 'owner_employee_id' => $anan->id]);

        // Waiting: on a leaver (15 days), on somebody without a login (4 days), on Anan (3 calendar days), on a department step (14 days).
        $this->request('R1', 'computer', 'pending', ['department_name' => 'Production']);
        $this->step('R1', 'approved', $byAnan('2026-09-01 09:00:00', '2026-09-03 17:00:00', ['label' => 'Supervisor']));
        $this->step('R1', 'current', ['position' => 2, 'label' => 'Vice President', 'approver_employee_id' => $wichai->id, 'approver_name' => 'Wichai', 'became_current_at' => '2026-09-10 10:00:00']);
        $this->request('R2', 'email', 'pending', ['department_name' => 'Safety']);
        $this->step('R2', 'current', ['approver_employee_id' => $porn->id, 'approver_name' => 'Porn', 'became_current_at' => '2026-09-21 08:00:00']);
        // Filed by somebody in Safety, with no department written on the request.
        $this->request('R3', 'computer', 'pending', ['employee_id' => $porn->id]);
        $this->step('R3', 'current', ['approver_employee_id' => $anan->id, 'approver_name' => 'Anan', 'became_current_at' => '2026-09-22 18:00:00']);
        $this->request('R10', 'cctv', 'pending', ['department_name' => 'Safety']);
        $this->step('R10', 'current', ['actor_type' => 'department', 'label' => 'SE Dept.', 'approver_department_id' => $safety->id, 'approver_position_ids' => [$manager->id], 'became_current_at' => '2026-09-11 08:00:00']);

        // Rejected at a step, in September and in August.
        // Written down as Safety, but the requester's department is Production.
        $this->request('R4', 'mobile', 'rejected', ['employee_id' => $anan->id, 'department_name' => 'Safety', 'rejected_at' => '2026-09-15 11:00:00']);
        $this->step('R4', 'rejected', $byAnan('2026-09-14 09:00:00', '2026-09-15 11:00:00', ['note' => 'Not needed now']));
        $this->request('R13', 'mobile', 'rejected', ['rejected_at' => '2026-08-20 11:00:00', 'created_at' => '2026-08-19 08:00:00']);
        $this->step('R13', 'rejected', $byAnan('2026-08-19 09:00:00', '2026-08-20 11:00:00', ['note' => 'Budget used up']));

        // Withdrawn while waiting: with a reason (new) and without one (before the reason was required).
        $this->request('R5', 'computer', 'cancelled', ['cancelled_at' => '2026-09-20 12:00:00', 'cancel_reason' => 'Filed the wrong type', 'cancelled_by_name' => 'Requester R5']);
        $this->step('R5', 'waiting', ['approver_employee_id' => $anan->id, 'approver_name' => 'Anan', 'became_current_at' => '2026-09-18 09:00:00']);
        $this->request('R6', 'email', 'cancelled', ['cancelled_at' => '2026-09-05 12:00:00']);
        $this->step('R6', 'waiting', ['approver_employee_id' => $anan->id, 'approver_name' => 'Anan', 'became_current_at' => '2026-09-02 09:00:00']);

        // Approved, then IT closed the ticket without delivery.
        $this->request('R7', 'computer', 'cancelled', ['approved_at' => '2026-09-02 15:00:00', 'cancelled_at' => '2026-09-12 16:00:00']);
        $this->step('R7', 'approved', $byAnan('2026-09-02 09:00:00', '2026-09-02 15:00:00'));
        $this->step('R7', 'rejected', ['position' => 2, 'kind' => 'completion', 'actor_type' => 'it_staff', 'label' => 'IT Staff', 'acted_by_name' => 'Kan', 'note' => 'Covered by another request.', 'became_current_at' => '2026-09-02 15:00:00', 'acted_at' => '2026-09-12 16:00:00']);

        // Skipped steps: owner missing (today: still missing / owned now), Supervisor not in the line, no manager, empty department, requester owns it.
        $this->request('R8', 'mailgroup', 'completed', ['email_group_id' => $groupNoOwner->id]);
        $this->step('R8', 'skipped', ['actor_type' => 'owner', 'label' => 'Resource Owner', 'skip_reason' => 'no_resource_owner']);
        $this->request('R14', 'mailgroup', 'completed', ['email_group_id' => $groupOwned->id]);
        $this->step('R14', 'skipped', ['actor_type' => 'owner', 'label' => 'Resource Owner', 'skip_reason' => 'no_resource_owner']);
        $this->request('R9', 'computer', 'completed');
        $this->step('R9', 'skipped', ['label' => 'Supervisor', 'skip_reason' => 'no_matching_position']);
        // A department step decided by an account with no employee behind it.
        $this->step('R9', 'approved', ['position' => 2, 'actor_type' => 'department', 'label' => 'QC Dept.', 'approver_department_id' => $safety->id, 'acted_by_user_id' => $admin->id, 'acted_by_name' => 'IT Service Desk', 'became_current_at' => '2026-09-06 09:00:00', 'acted_at' => '2026-09-07 09:00:00']);
        $this->request('R11', 'telephone', 'completed', ['employee_id' => $noManager->id]);
        $this->step('R11', 'skipped', ['label' => 'Supervisor', 'skip_reason' => 'no_manager']);
        $this->step('R11', 'approved', $byAnan('2026-09-08 09:00:00', '2026-09-09 09:00:00', ['position' => 2]));
        $this->request('R15', 'cctv', 'completed');
        $this->step('R15', 'skipped', ['actor_type' => 'department', 'label' => 'SE Dept.', 'skip_reason' => 'no_department_approver', 'approver_department_id' => $safety->id, 'approver_position_ids' => [$manager->id]]);
        $this->request('R16', 'fileshare', 'completed', ['file_share_id' => $share->id, 'employee_id' => $anan->id]);
        $this->step('R16', 'skipped', ['actor_type' => 'owner', 'label' => 'Resource Owner', 'skip_reason' => 'requester_is_owner']);

        // Left out everywhere: IT's queue step, and a step left current on a cancelled request.
        $this->request('R20', 'computer', 'approved', ['approved_at' => '2026-09-03 10:00:00']);
        $this->step('R20', 'current', ['kind' => 'completion', 'actor_type' => 'it_staff', 'label' => 'IT Staff', 'became_current_at' => '2026-09-03 10:00:00']);
        $this->request('R21', 'computer', 'cancelled', ['cancelled_at' => '2026-09-04 10:00:00']);
        $this->step('R21', 'current', ['approver_name' => 'Ghost', 'became_current_at' => '2026-09-02 10:00:00']);

        // The first request in the system, last December.
        $this->request('R12', 'other', 'rejected', ['rejected_at' => '2025-12-12 10:00:00', 'created_at' => '2025-12-10 08:00:00']);
        $this->step('R12', 'rejected', $byAnan('2025-12-10 09:00:00', '2025-12-12 10:00:00'));
    }

    /** @param array<string, string> $query */
    private function rows(array $query = []): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/tabular/requests.approvals/rows?per_page=100&'.http_build_query($query))->assertOk()->json();
    }

    /** @param array<string, string> $query */
    private function breakdown(array $query = []): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/requests/approvals/breakdown?'.http_build_query($query))->assertOk()->json('data');
    }

    public function test_rows_are_one_per_step_with_whole_day_waits(): void
    {
        $body = $this->rows();
        $rows = collect($body['data']);

        // 10 steps that reached somebody + 2 left waiting by a withdrawal + 6 skipped.
        $this->assertSame(18, $body['meta']['total']);
        $byRequest = fn (string $name) => $rows->where('request_no', $this->r[$name]->reference)->values();

        $leaver = $byRequest('R1')->firstWhere('status', 'current');
        $this->assertSame('Wichai', $leaver['approver']);
        $this->assertSame('EMP-2', $leaver['approver_code']);
        $this->assertSame('left', $leaver['approver_flag']);
        $this->assertEquals(15, $leaver['days']);
        // 22 Sep 18:00 → 25 Sep 10:00 counts as 3 calendar days.
        $this->assertEquals(3, $byRequest('R3')->first()['days']);
        $this->assertSame('no_account', $byRequest('R2')->first()['approver_flag']);

        $withdrawn = $byRequest('R5')->first();
        $this->assertSame('withdrawn', $withdrawn['status']);
        $this->assertEquals(2, $withdrawn['days']);

        $skipped = $byRequest('R9')->firstWhere('status', 'skipped');
        $this->assertNull($skipped['approver']);
        $this->assertSame('no_matching_position', $skipped['skip_reason']);
        $this->assertSame('unlinked_account', $byRequest('R9')->firstWhere('status', 'approved')['approver_kind']);
        $this->assertSame('group_step', $byRequest('R10')->first()['approver_kind']);

        // Neither IT's queue step nor a step left current on a cancelled request.
        $this->assertCount(0, $byRequest('R20'));
        $this->assertCount(0, $byRequest('R21'));
    }

    public function test_rows_follow_type_department_and_approver(): void
    {
        $this->assertSame(
            [$this->r['R2']->reference, $this->r['R6']->reference],
            array_column($this->rows(['type' => 'email'])['data'], 'request_no'),
        );
        // The requester's department; the request's own record only when no employee is linked.
        $safety = Department::query()->where('name', 'Safety')->value('id');
        $this->assertEqualsCanonicalizing(
            [$this->r['R2']->reference, $this->r['R3']->reference, $this->r['R10']->reference],
            array_column($this->rows(['department_id' => (string) $safety])['data'], 'request_no'),
        );
        // Anan's decided and waiting steps plus the two withdrawals that waited on him; skipped steps have no approver.
        $anan = $this->rows(['approver' => 'Anan']);
        $this->assertSame(8, $anan['meta']['total']);
        $this->assertNotContains('skipped', array_column($anan['data'], 'status'));
    }

    public function test_tiles(): void
    {
        $tiles = collect($this->rows()['summary'])->keyBy('key');

        $waiting = $tiles['rqa_waiting'];
        $this->assertSame(4, $waiting['value']);
        $this->assertSame(['over_7' => 2, 'days_4_7' => 1, 'upto_3' => 1], array_column($waiting['split'], 'value', 'key'));
        $this->assertSame('amber', $waiting['attention']);

        // [2, 15, 4, 3, 1, 0, 1, 14, 1, 1] days over 10 steps.
        $avg = $tiles['rqa_avg_days'];
        $this->assertEquals(4.2, $avg['value']);
        $this->assertSame('days', $avg['format']);
        $this->assertSame(2, $tiles['rqa_rejected']['value']);
        $this->assertSame(6, $tiles['rqa_skipped']['value']);
        // Trend tiles carry only their trend.
        foreach (['rqa_avg_days', 'rqa_rejected', 'rqa_skipped'] as $key) {
            $this->assertSame(['label_key', 'trend'], array_keys($tiles[$key]['note']));
        }

        $this->assertSame(2, $tiles['rqa_blocked']['value']);
        $this->assertSame(['left' => 1, 'no_account' => 1], array_column($tiles['rqa_blocked']['split'], 'value', 'key'));
    }

    public function test_trend_is_withheld_when_the_previous_period_starts_before_the_first_request(): void
    {
        // 1 Jan–25 Sep looks back to April 2025; the first request is from December 2025.
        $tiles = collect($this->rows()['summary'])->keyBy('key');
        $trend = $tiles['rqa_rejected']['note']['trend'];
        $this->assertSame('rep_req_trend_no_base', $trend['label_key']);
        $this->assertSame([], $trend['values']);
        $this->assertSame('even', $trend['direction']);
        $this->assertSame([0, 0, 0, 0, 0, 0, 0, 1, 1], $trend['points']);
        $this->assertEquals([null, null, null, null, null, null, null, 1.0, 4.6], $tiles['rqa_avg_days']['note']['trend']['points']);
    }

    public function test_trend_compares_with_the_previous_period_of_the_same_length(): void
    {
        // 1–25 Sep against 7–31 Aug.
        $tiles = collect($this->rows(['from' => '2026-09-01', 'to' => '2026-09-25'])['summary'])->keyBy('key');

        $avg = $tiles['rqa_avg_days']['note']['trend'];
        $this->assertSame('rep_req_trend_prev', $avg['label_key']);
        $this->assertSame('up', $avg['direction']);
        $this->assertEquals(3.6, $avg['values']['delta']);
        $this->assertFalse($avg['up_is_good']);

        $rejected = $tiles['rqa_rejected']['note']['trend'];
        $this->assertSame('even', $rejected['direction']);
        $this->assertSame([1], $rejected['points']);

        $skipped = $tiles['rqa_skipped']['note']['trend'];
        $this->assertSame('up', $skipped['direction']);

        // Nothing decided in August for this type: the change has no base to stand on.
        $cctv = collect($this->rows(['from' => '2026-09-01', 'to' => '2026-09-25', 'type' => 'cctv'])['summary'])->keyBy('key');
        $this->assertSame('rep_req_trend_none', $cctv['rqa_avg_days']['note']['trend']['label_key']);
        $this->assertSame([], $cctv['rqa_avg_days']['note']['trend']['values']);
        $this->assertEquals(6, $skipped['values']['delta']);
        $this->assertNull($skipped['up_is_good']);
    }

    public function test_breakdown_waiting_now_and_approvers(): void
    {
        $data = $this->breakdown();

        $stuck = $data['stuck'];
        $this->assertSame([$this->r['R1']->reference], array_column($stuck['left'], 'reference'));
        $this->assertSame('2026-09-10', $stuck['left'][0]['approver_left_on']);
        $this->assertSame([$this->r['R2']->reference], array_column($stuck['no_account'], 'reference'));
        $this->assertSame([$this->r['R10']->reference], array_column($stuck['over7'], 'reference'));
        $this->assertSame([$this->r['R3']->reference], array_column($stuck['upto7'], 'reference'));
        $this->assertSame('upto_3', $stuck['upto7'][0]['age_band']);
        $this->assertSame('days_4_7', $stuck['no_account'][0]['age_band']);

        $rows = collect($data['approvers']['rows']);
        $this->assertSame(['Wichai', 'Porn', 'Anan', 'SE Dept.', 'IT Service Desk'], $rows->pluck('key')->all());
        $anan = $rows->firstWhere('key', 'Anan');
        $this->assertSame(['steps' => 6, 'approved' => 3, 'rejected' => 2, 'waiting' => 1, 'max_days' => 3, 'oldest_waiting_days' => 3],
            array_intersect_key($anan, array_flip(['steps', 'approved', 'rejected', 'waiting', 'max_days', 'oldest_waiting_days'])));
        $this->assertEquals(1.3, $anan['avg_days']);
        $this->assertSame('EMP-1', $anan['code']);
        $this->assertTrue($rows->firstWhere('key', 'Wichai')['left']);
        $this->assertTrue($rows->firstWhere('key', 'Porn')['no_account']);
        $seDept = $rows->firstWhere('key', 'SE Dept.');
        $this->assertTrue($seDept['apart']);
        $this->assertSame('group_step', $seDept['kind']);
        $this->assertSame('Safety', $seDept['department']['name']);
        $this->assertSame('unlinked_account', $rows->firstWhere('key', 'IT Service Desk')['kind']);

        $total = $data['approvers']['total'];
        $this->assertSame(['approvers' => 5, 'steps' => 10, 'approved' => 4, 'rejected' => 2, 'waiting' => 4], array_intersect_key($total, array_flip(['approvers', 'steps', 'approved', 'rejected', 'waiting'])));
        $this->assertEquals(4.2, $total['avg_days']);
        $this->assertSame(15, $total['max_days']);
    }

    public function test_breakdown_ended_requests(): void
    {
        $endings = $this->breakdown()['endings'];

        $this->assertSame(['all' => 5, 'rejected' => 2, 'withdrawn' => 2, 'not_delivered' => 1], $endings['counts']);
        $this->assertSame(
            array_map(fn (string $n) => $this->r[$n]->reference, ['R5', 'R4', 'R7', 'R6', 'R13']),
            array_column($endings['rows'], 'reference'),
        );
        [$r5, $r4, $r7, $r6] = $endings['rows'];
        $this->assertSame(['outcome' => 'withdrawn', 'stop_label' => 'Manager', 'decided_by' => 'Requester R5', 'reason' => 'Filed the wrong type'],
            array_intersect_key($r5, array_flip(['outcome', 'stop_label', 'decided_by', 'reason'])));
        $this->assertSame(['outcome' => 'rejected', 'decided_by' => 'Anan', 'reason' => 'Not needed now'], array_intersect_key($r4, array_flip(['outcome', 'decided_by', 'reason'])));
        $this->assertSame(['outcome' => 'not_delivered', 'stop_label' => null, 'decided_by' => 'Kan', 'reason' => 'Covered by another request.'],
            array_intersect_key($r7, array_flip(['outcome', 'stop_label', 'decided_by', 'reason'])));
        // Withdrawn before a reason was required.
        $this->assertNull($r6['reason']);
        $this->assertNull($r6['decided_by']);

        // The approver filter keeps what that approver decided or was waited on for; IT's closing is not an approver's.
        $this->assertSame(['all' => 4, 'rejected' => 2, 'withdrawn' => 2, 'not_delivered' => 0], $this->breakdown(['approver' => 'Anan'])['endings']['counts']);
    }

    public function test_breakdown_skips_name_what_to_look_at(): void
    {
        $skips = collect($this->breakdown()['skips'])->keyBy('reason');

        $this->assertSame(['no_matching_position', 'no_resource_owner', 'no_manager', 'no_department_approver', 'requester_is_owner'], $skips->keys()->all());
        $this->assertSame(['Supervisor' => 1], $skips['no_matching_position']['labels']);
        $this->assertSame([['name' => 'Requester R9', 'count' => 1]], $skips['no_matching_position']['top_requesters']);

        $owner = $skips['no_resource_owner'];
        $this->assertSame([2, 2, 2], [$owner['steps'], $owner['requests'], $owner['unapproved_requests']]);
        // Only the group that still has no owner today.
        $this->assertSame([['name' => 'Ownerless Group', 'code' => 'MG-1']], $owner['ownerless_resources']);

        $this->assertSame([['name' => 'Mongkol Test', 'code' => 'EMP-9']], $skips['no_manager']['managerless_requesters']);
        $this->assertSame(0, $skips['no_manager']['unapproved_requests']);
        $this->assertSame('Safety', $skips['no_department_approver']['departments'][0]['department']['name']);
        $this->assertSame(['Manager'], $skips['no_department_approver']['departments'][0]['positions']);
        $this->assertSame([['name' => 'Own Share', 'code' => 'FS-1']], $skips['requester_is_owner']['resources']);
    }

    public function test_a_manager_set_since_clears_the_no_manager_hint(): void
    {
        Employee::query()->where('code', 'EMP-9')->update(['manager_id' => Employee::query()->where('code', 'EMP-1')->value('id')]);

        $this->assertSame([], collect($this->breakdown()['skips'])->firstWhere('reason', 'no_manager')['managerless_requesters']);
    }

    public function test_empty_range(): void
    {
        // Period figures go empty; what waits now does not depend on the range.
        $tiles = collect($this->rows(['from' => '2024-01-01', 'to' => '2024-01-31'])['summary'])->keyBy('key');
        $this->assertSame(4, $tiles['rqa_waiting']['value']);
        $this->assertNull($tiles['rqa_avg_days']['value']);
        $this->assertSame(0, $tiles['rqa_rejected']['value']);
        $this->assertSame('rep_req_trend_no_base', $tiles['rqa_avg_days']['note']['trend']['label_key']);
        $this->assertSame('red', $tiles['rqa_blocked']['attention']);

        // Nothing blocked: no red frame.
        $cctv = collect($this->rows(['type' => 'cctv'])['summary'])->keyBy('key');
        $this->assertSame(0, $cctv['rqa_blocked']['value']);
        $this->assertNull($cctv['rqa_blocked']['attention']);

        $data = $this->breakdown(['from' => '2024-01-01', 'to' => '2024-01-31']);
        $this->assertSame([], $data['approvers']['rows']);
        $this->assertSame(0, $data['endings']['counts']['all']);
        $this->assertSame([0, 0, 0, 0, 0], array_column($data['skips'], 'steps'));
    }

    public function test_waiting_now_ignores_the_date_range(): void
    {
        // Current since 20 Dec, still waiting today: counted as waiting now, but not as reached in a range that starts later.
        $this->request('R30', 'computer', 'pending');
        $this->step('R30', 'current', ['approver_name' => 'Late Approver', 'became_current_at' => '2025-12-20 09:00:00']);

        $tiles = collect($this->rows(['from' => '2026-09-01', 'to' => '2026-09-25'])['summary'])->keyBy('key');
        $this->assertSame(5, $tiles['rqa_waiting']['value']);
        $this->assertSame(['over_7' => 3, 'days_4_7' => 1, 'upto_3' => 1], array_column($tiles['rqa_waiting']['split'], 'value', 'key'));
        $this->assertSame(279, $this->breakdown(['from' => '2026-09-01', 'to' => '2026-09-25'])['stuck']['over7'][0]['days']);
        $this->assertSame(9, $this->breakdown(['from' => '2026-09-01', 'to' => '2026-09-25'])['approvers']['total']['steps']);

        $data = $this->breakdown(['from' => '2026-09-01', 'to' => '2026-09-25']);
        $this->assertSame($this->r['R30']->reference, $data['stuck']['over7'][0]['reference']);
        $this->assertNotContains('Late Approver', array_column($data['approvers']['rows'], 'key'));
    }

    public function test_the_file_carries_the_cards_as_sheets(): void
    {
        $report = app(RequestApprovalsReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['รออนุมัติตอนนี้', 'ผู้อนุมัติ', 'คำขอที่ไม่อนุมัติและยกเลิก', 'ขั้นอนุมัติที่ระบบข้าม'], array_column($sections, 'title'));
        $this->assertSame('ผู้อนุมัติลาออกแล้ว', $sections[0]['rows'][0][0]);
        $withdrawnNoReason = collect($sections[2]['rows'])->firstWhere(0, $this->r['R6']->reference);
        $this->assertSame('ไม่ได้บันทึกเหตุผล', $withdrawnNoReason[5]);
    }

    public function test_needs_view_all(): void
    {
        $submitter = $this->userWith(['requests.submit', 'requests.complete']);

        $this->actingAs($submitter)->getJson('/api/reports/tabular/requests.approvals/rows')->assertForbidden();
        $this->actingAs($submitter)->getJson('/api/reports/requests/approvals/breakdown')->assertForbidden();
    }

    public function test_an_unknown_approver_is_rejected(): void
    {
        $this->actingAs($this->userWith())->getJson('/api/reports/requests/approvals/breakdown?approver=Nobody')->assertUnprocessable();
    }
}
