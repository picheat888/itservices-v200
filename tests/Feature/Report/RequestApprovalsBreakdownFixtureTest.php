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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * Pins the requests.approvals breakdown cards on a mixed dataset (waiting on leavers and no-login approvers,
 * group steps, skips, rejections, withdrawals, range edges) against tests/Fixtures/request-approvals-breakdown.json.
 */
class RequestApprovalsBreakdownFixtureTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    private const FIXTURE = __DIR__.'/../../Fixtures/request-approvals-breakdown.json';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
        $this->seedRequests();
    }

    private function seedRequests(): void
    {
        $prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $safety = Department::create(['name' => 'Safety', 'name_th' => null, 'tag' => 'SE']);
        $manager = Position::create(['code' => 'P-MGR', 'title' => 'Manager']);
        $lead = Position::create(['code' => 'P-LD', 'title' => 'Leader']);
        $person = fn (string $code, ?Department $d, array $extra = []) => Employee::create(['code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d?->id, 'status' => 'active', ...$extra]);
        $staff = [
            $person('E1', $prod), $person('E2', $prod, ['status' => 'resigned', 'last_day' => '2026-09-10']), $person('E3', $safety),
            $person('E4', $safety, ['status' => 'resigned']), $person('E5', null, ['status' => 'resigned', 'last_day' => '2026-12-31']), $person('E6', $prod),
        ];
        // E3 and E4 never got a login
        $users = [];
        foreach ([0, 1, 4, 5] as $i) {
            $users[$i] = User::factory()->create(['name' => $staff[$i]->code, 'employee_id' => $staff[$i]->id]);
        }
        $orphanUser = User::factory()->create(['name' => 'Orphan']);
        $group = EmailGroup::create(['code' => 'MG-1', 'name' => 'Ownerless', 'email' => 'o@x.co']);
        $owned = EmailGroup::create(['code' => 'MG-2', 'name' => 'Owned', 'email' => 'w@x.co', 'owner_employee_id' => $staff[0]->id]);
        $share = FileShare::create(['code' => 'FS-1', 'name' => 'Share', 'path' => '\\\\fs\\a', 'owner_employee_id' => null]);

        $types = ['computer', 'email', 'mailgroup', 'fileshare', 'cctv', 'mobile', 'software'];
        $names = ['E1', 'e1', 'Somchai', '123', 'IT Service Desk', 'Somchai ', 'Mgr Dept.'];
        $times = ['2026-03-01 00:00:00', '2026-05-31 23:59:59', '2026-02-28 23:59:59', '2026-06-01 00:00:00', '2026-09-24 09:15:00', '2026-09-25 09:59:59', '2025-12-31 23:59:59'];
        $skipReasons = ['no_matching_position', 'no_resource_owner', 'no_manager', 'no_department_approver', 'requester_is_owner'];
        $at = fn (int $i, int $plus = 0) => date('Y-m-d H:i:s', strtotime('2026-01-01 08:00:00') + (($i * 173) % 265) * 86400 + $plus * 86400 + (($i * 7919) % 36000));

        for ($i = 0; $i < 160; $i++) {
            $status = ['pending', 'pending', 'rejected', 'cancelled', 'completed', 'approved'][$i % 6];
            $created = $i < 7 ? $times[$i] : $at($i);
            $requester = $staff[$i % 6];
            $extra = match ($types[$i % 7]) {
                'mailgroup' => ['email_group_id' => ($i % 2 ? $group : $owned)->id],
                'fileshare' => ['file_share_id' => $share->id],
                default => [],
            };
            $request = ServiceRequest::create([
                'reference' => sprintf('RQ-2026-%04d', $i + 1), 'type' => $types[$i % 7], 'origin' => 'direct', 'employee_id' => $i % 9 === 0 ? null : $requester->id,
                'department_name' => $i % 9 === 0 ? ['Production', 'Safety', 'Nowhere'][$i % 3] : null,
                'requester_name' => 'Req '.($i % 5), 'title' => "Request {$i}", 'reason' => 'Needed.', 'status' => $status,
                'rejected_at' => $status === 'rejected' ? $at($i, 2) : null, 'cancelled_at' => $status === 'cancelled' ? $at($i, 3) : null,
                'cancel_reason' => $status === 'cancelled' && $i % 4 === 0 ? 'Changed mind' : null, 'cancelled_by_name' => $status === 'cancelled' ? 'Req' : null,
            ] + $extra);
            ServiceRequest::query()->whereKey($request->id)->update(['created_at' => $created]);

            $count = 1 + $i % 3;
            for ($p = 1; $p <= $count; $p++) {
                $last = $p === $count;
                $stepStatus = match (true) {
                    $status === 'completed' && $i % 12 === 4 => 'skipped',
                    ! $last => $i % 10 === 5 ? 'skipped' : 'approved',
                    $status === 'pending' => 'current',
                    $status === 'rejected' => 'rejected',
                    $status === 'cancelled' => 'waiting',
                    default => $i % 8 === 0 ? 'skipped' : 'approved',
                };
                $became = $i % 11 === 0 && $p === 1 ? $times[($i + $p) % 7] : $at($i + $p, 0);
                $decided = in_array($stepStatus, ['approved', 'rejected'], true) && $i % 13 !== 0;
                $name = $names[($i + $p) % 7];
                $employee = $stepStatus === 'current' && $i % 4 === 1 ? $staff[$i % 8 === 1 ? 2 : 3] : $staff[($i + $p) % 6];
                $linked = $i % 3 !== 0;
                $row = [
                    'service_request_id' => $request->id, 'position' => $p, 'actor_type' => 'chain', 'kind' => 'approval', 'label' => $i % 5 === 0 ? '' : "Rung {$p}",
                    'status' => $stepStatus, 'became_current_at' => $stepStatus === 'skipped' ? null : $became,
                    'acted_at' => $decided ? date('Y-m-d H:i:s', strtotime($became) + (($i + $p) % 6) * 86400 + 3600 * (($i + $p) % 23)) : null,
                    'note' => $stepStatus === 'rejected' ? "No {$i}" : null,
                ];
                if ($stepStatus === 'skipped') {
                    $row += ['skip_reason' => $skipReasons[($i + $p) % 5], 'approver_department_id' => $safety->id, 'approver_position_ids' => [$manager->id, $lead->id]];
                } elseif ($i % 7 === 0) {
                    $row += ['actor_type' => 'department', 'label' => 'Mgr Dept.', 'approver_department_id' => $safety->id, 'approver_position_ids' => [$manager->id]] + ($decided ? ['acted_by_user_id' => $orphanUser->id, 'acted_by_name' => 'IT Service Desk'] : []);
                } else {
                    $row += ['approver_employee_id' => $linked ? $employee->id : null, 'approver_name' => $linked ? $employee->code : $name]
                        + ($decided && isset($users[($i + $p) % 6]) ? ['acted_by_user_id' => $users[($i + $p) % 6]->id, 'acted_by_name' => $staff[($i + $p) % 6]->code] : ($decided && $i % 4 === 0 ? ['acted_by_name' => 'Somchai'] : []));
                }
                RequestApproval::create($row);
            }
            // IT's closing of an approved request without delivery
            if ($status === 'cancelled' && $i % 5 === 3) {
                RequestApproval::create(['service_request_id' => $request->id, 'position' => 9, 'kind' => 'completion', 'actor_type' => 'it_staff', 'label' => 'IT Staff',
                    'status' => 'rejected', 'acted_by_name' => 'Kan', 'note' => 'Covered', 'became_current_at' => $at($i, 1), 'acted_at' => $at($i, 3)]);
            }
        }
    }

    private function viewer(): User
    {
        $role = Role::create(['key' => 'rep_fx', 'name' => 'Report Test', 'is_system' => false]);
        foreach ($this->reportRights('requests') as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return array<string, mixed> */
    private function cards(): array
    {
        $viewer = $this->viewer();
        $safety = Department::query()->where('tag', 'SE')->value('id');
        $queries = [
            'all' => '', 'year' => '?from=2026-01-01&to=2026-12-31', 'type' => '?type=computer', 'mailgroup' => '?type=mailgroup',
            'range' => '?from=2026-03-01&to=2026-05-31', 'empty' => '?from=2024-01-01&to=2024-01-31', 'edge' => '?from=2026-06-01&to=2026-09-24',
            'approver' => '?approver=E1', 'approver_name' => '?approver=Somchai', 'approver_group' => '?approver=Mgr%20Dept.&from=2026-01-01&to=2026-09-25',
            'approver_range' => '?approver=E1&from=2026-03-01&to=2026-05-31', 'department' => "?department_id={$safety}",
            'department_type' => "?department_id={$safety}&type=email&from=2026-02-01&to=2026-08-31",
        ];
        $out = [];
        foreach ($queries as $name => $query) {
            $out[$name] = $this->actingAs($viewer)->getJson('/api/reports/requests/approvals/breakdown'.$query)->assertOk()->json('data');
        }

        return $out;
    }

    public function test_breakdown_cards_match_the_pinned_fixture(): void
    {
        $cards = $this->cards();
        if (getenv('WRITE_FIXTURE')) {
            file_put_contents(self::FIXTURE, json_encode($cards, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        }

        $this->assertSame(file_get_contents(self::FIXTURE), json_encode($cards, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        // The fixture must exercise every card
        $this->assertGreaterThan(5, count($cards['year']['approvers']['rows']));
        $this->assertNotEmpty($cards['all']['stuck']['left'] + $cards['all']['stuck']['over7']);
        $this->assertGreaterThan(0, $cards['year']['endings']['counts']['all']);
    }
}
