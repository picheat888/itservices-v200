<?php

// Request list/detail must not query per row: query count stays flat as rows grow, group-step JSON unchanged.

namespace Tests\Feature;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Database\Seeders\EmployeePositionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RequestListQueryCountTest extends TestCase
{
    use RefreshDatabase;

    private Department $qc;

    private Employee $viewerEmployee;

    private User $viewer;

    private int $created = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);

        $this->qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control', 'name_th' => 'ควบคุมคุณภาพ']);
        $this->viewerEmployee = Employee::create([
            'first_name' => 'Viewer', 'department_id' => $this->qc->id, 'position_id' => $this->positionId('Manager'),
        ]);

        $role = Role::firstOrCreate(['key' => 'viewer'], ['name' => 'viewer', 'color' => '#64748b', 'is_system' => false]);
        foreach (['requests.module', 'requests.submit', 'requests.view_all', 'requests.complete'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }
        $this->viewer = User::factory()->create(['role' => 'viewer', 'employee_id' => $this->viewerEmployee->id]);
    }

    private function positionId(string $title): int
    {
        return Position::where('title', $title)->firstOrFail()->id;
    }

    /** A person with a login, so the trail's awaiting_account has an account to find. */
    private function person(string $name, bool $withAccount = true): Employee
    {
        $employee = Employee::create(['first_name' => $name, 'department_id' => $this->qc->id]);
        if ($withAccount) {
            User::factory()->create(['employee_id' => $employee->id]);
        }

        return $employee;
    }

    /** Rotates through a named-group step, a department-group step and an approved request. */
    private function makeRequests(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $variant = $this->created++ % 3;
            $requester = $this->person("Req{$this->created}", withAccount: $this->created % 2 === 0);
            $request = ServiceRequest::create([
                'type' => 'cctv',
                'employee_id' => $requester->id,
                'requester_name' => $requester->name,
                'title' => "Request {$this->created}",
                'reason' => 'Query count fixture',
                'status' => $variant === 2 ? RequestStatus::Approved->value : RequestStatus::Pending->value,
                'last_activity_at' => now()->subMinutes($this->created),
            ]);

            $chief = $this->person("Chief{$this->created}");
            $this->row($request, 1, [
                'actor_type' => 'chain', 'approver_employee_id' => $chief->id, 'approver_name' => $chief->name,
                'status' => ApprovalStatus::Approved->value, 'acted_by_name' => $chief->name, 'acted_at' => now(),
            ]);

            $groupStatus = $variant === 2 ? ApprovalStatus::Approved->value : ApprovalStatus::Current->value;
            if ($variant === 0) {
                $alternate = $this->person("Alt{$this->created}");
                $this->row($request, 2, [
                    'actor_type' => 'department', 'status' => $groupStatus,
                    'approver_employee_ids' => [$alternate->id, $this->viewerEmployee->id],
                ]);
            } else {
                $this->row($request, 2, [
                    'actor_type' => 'department', 'status' => $groupStatus,
                    'approver_department_id' => $this->qc->id,
                    'approver_position_ids' => [$this->positionId('Manager'), $this->positionId('Supervisor')],
                ]);
            }

            $this->row($request, 3, [
                'actor_type' => 'it_staff', 'kind' => 'completion',
                'status' => $variant === 2 ? ApprovalStatus::Current->value : ApprovalStatus::Waiting->value,
            ]);
        }
    }

    /** @param  array<string, mixed>  $attributes */
    private function row(ServiceRequest $request, int $position, array $attributes): void
    {
        RequestApproval::create(array_merge([
            'service_request_id' => $request->id,
            'position' => $position,
            'kind' => 'approval',
            'label' => "Step {$position}",
        ], $attributes));
    }

    private function countQueries(string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->viewer)->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_list_queries_do_not_grow_with_the_number_of_rows(): void
    {
        $urls = [
            '/api/service-requests',
            '/api/service-requests?sort=activity',
            '/api/service-requests?sort=oldest',
            '/api/service-requests?scope=approvals',
        ];

        $this->makeRequests(3);
        // Warm-up: the first call loads the viewer's role and employee onto the reused user instance.
        $this->countQueries($urls[0]);
        $small = array_map(fn (string $url) => $this->countQueries($url), $urls);

        $this->makeRequests(7);
        $large = array_map(fn (string $url) => $this->countQueries($url), $urls);

        $this->assertSame(10, ServiceRequest::count());
        $this->assertSame($small, $large, 'Query count grew with the number of rows: '.json_encode(compact('small', 'large')));
    }

    public function test_detail_queries_do_not_grow_with_the_number_of_group_steps(): void
    {
        // Request 1 carries a named-group step; one department-group step joins it so both lookups run.
        $this->makeRequests(1);
        $one = ServiceRequest::firstOrFail();
        $this->departmentRow($one, 4);
        $this->countQueries("/api/service-requests/{$one->id}");
        $few = $this->countQueries("/api/service-requests/{$one->id}");

        // Same request, two more group steps of each kind.
        foreach ([5, 6] as $position) {
            $this->row($one, $position, ['actor_type' => 'department', 'approver_employee_ids' => [$this->person("X{$position}")->id]]);
        }
        foreach ([7, 8] as $position) {
            $this->departmentRow($one, $position);
        }

        $this->assertSame($few, $this->countQueries("/api/service-requests/{$one->id}"));
    }

    private function departmentRow(ServiceRequest $request, int $position): void
    {
        $this->row($request, $position, [
            'actor_type' => 'department', 'approver_department_id' => $this->qc->id,
            'approver_position_ids' => [$this->positionId('Supervisor')],
        ]);
    }

    public function test_group_step_json_carries_thai_twins(): void
    {
        $this->makeRequests(3);
        Employee::where('first_name', 'Alt1')->first()->update(['first_name_th' => 'อัลท์']);
        $this->qc->update(['name_th' => 'ควบคุมคุณภาพ']);
        $list = collect($this->actingAs($this->viewer)->getJson('/api/service-requests')->assertOk()->json('data'))
            ->keyBy('title');

        $this->assertSame(['อัลท์', null], $list['Request 1']['approvals'][1]['approver_candidates_th']);
        $this->assertSame('ควบคุมคุณภาพ', $list['Request 2']['approvals'][1]['approver_department_th']);
    }

    public function test_group_step_json_keeps_its_shape(): void
    {
        $this->makeRequests(3);
        $list = collect($this->actingAs($this->viewer)->getJson('/api/service-requests')->assertOk()->json('data'))
            ->keyBy('title');

        $named = $list['Request 1'];
        $namedRow = $named['approvals'][1];
        $this->assertSame(['Alt1', 'Viewer'], $namedRow['approver_candidates']);
        $this->assertArrayNotHasKey('approver_department', $namedRow);
        $this->assertArrayNotHasKey('approver_positions', $namedRow);
        $this->assertTrue($named['can_approve']);

        $department = $list['Request 2'];
        $departmentRow = $department['approvals'][1];
        $this->assertSame('Quality Control', $departmentRow['approver_department']);
        // Position titles come back in id order, not the order the step stored them.
        $expected = Position::whereIn('id', [$this->positionId('Manager'), $this->positionId('Supervisor')])
            ->orderBy('id')->pluck('title')->all();
        $this->assertSame($expected, $departmentRow['approver_positions']);
        $this->assertArrayNotHasKey('approver_candidates', $departmentRow);
        $this->assertTrue($department['can_approve']);

        $approved = $list['Request 3'];
        $this->assertFalse($approved['can_approve']);
        $this->assertTrue($approved['can_complete']);
        $this->assertFalse($approved['approvals'][0]['awaiting_account']);

        // The detail endpoint renders the same rows the same way.
        $detail = $this->actingAs($this->viewer)->getJson("/api/service-requests/{$named['id']}")->assertOk()->json('data');
        $this->assertSame($named['approvals'], $detail['approvals']);
        $this->assertTrue($detail['can_approve']);
    }

    public function test_the_requester_cannot_approve_a_group_step_on_their_own_request(): void
    {
        $this->makeRequests(2);
        $request = ServiceRequest::where('title', 'Request 2')->firstOrFail();
        // The viewer files the department-group request for themselves.
        $request->update(['employee_id' => $this->viewerEmployee->id]);

        $row = collect($this->actingAs($this->viewer)->getJson('/api/service-requests')->assertOk()->json('data'))
            ->firstWhere('id', $request->id);

        $this->assertFalse($row['can_approve']);
    }

    public function test_permission_holders_query_matches_has_permission(): void
    {
        $granted = Role::create(['key' => 'granted', 'name' => 'granted', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::create(['role_id' => $granted->id, 'permission' => 'requests.notify_approved', 'allowed' => true]);
        $denied = Role::create(['key' => 'denied', 'name' => 'denied', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::create(['role_id' => $denied->id, 'permission' => 'requests.notify_approved', 'allowed' => false]);

        User::factory()->create(['role' => 'super']);
        User::factory()->create(['role' => 'granted']);
        User::factory()->create(['role' => 'denied']);
        User::factory()->create(['role' => null]);

        foreach (['requests.notify_approved', 'requests.complete', 'employees.set_credentials'] as $permission) {
            $expected = User::all()->filter(fn (User $u) => $u->hasPermission($permission))->pluck('id')->sort()->values()->all();
            $actual = User::holdingPermission($permission)->pluck('id')->sort()->values()->all();

            $this->assertSame($expected, $actual, $permission);
        }
    }

    public function test_list_row_names_the_requester_position_and_who_it_waits_on(): void
    {
        $requester = Employee::create([
            'first_name' => 'Asker', 'first_name_th' => 'ผู้ขอ', 'last_name_th' => 'ทดสอบ',
            'department_id' => $this->qc->id, 'position_id' => $this->positionId('Supervisor'),
        ]);
        $request = ServiceRequest::create([
            'type' => 'cctv', 'employee_id' => $requester->id, 'requester_name' => $requester->name,
            'title' => 'Waiting fixture', 'reason' => 'List columns', 'status' => RequestStatus::Pending->value,
            'last_activity_at' => now(),
        ]);
        $boss = $this->person('Boss');
        $boss->update(['first_name_th' => 'หัวหน้า']);
        $this->row($request, 1, [
            'actor_type' => 'chain', 'label' => 'Direct manager', 'approver_employee_id' => $boss->id,
            'approver_name' => $boss->name, 'status' => ApprovalStatus::Current->value,
        ]);

        $row = collect($this->actingAs($this->viewer)->getJson('/api/service-requests')->assertOk()->json('data'))->firstWhere('id', $request->id);

        $this->assertSame('Supervisor', $row['requester']['position']);
        $this->assertSame($boss->name, $row['progress']['current_approver']);
        $this->assertSame('Direct manager', $row['progress']['current_label']);
        $this->assertSame('ผู้ขอ ทดสอบ', $row['requester']['name_th']);
        $this->assertSame('ควบคุมคุณภาพ', $row['requester']['department_th']);
        $this->assertSame('หัวหน้า', $row['progress']['current_approver_th']);
    }

    public function test_the_signer_and_the_activity_line_carry_a_thai_name(): void
    {
        $requester = $this->person('Asker2');
        $request = ServiceRequest::create([
            'type' => 'cctv', 'employee_id' => $requester->id, 'requester_name' => $requester->name,
            'title' => 'Signed fixture', 'reason' => 'Thai signer', 'status' => RequestStatus::Approved->value,
            'last_activity_at' => now(),
        ]);
        $signerEmployee = Employee::create(['first_name' => 'Signer', 'first_name_th' => 'ผู้ลงนาม', 'department_id' => $this->qc->id]);
        $signer = User::factory()->create(['employee_id' => $signerEmployee->id]);
        $this->row($request, 1, [
            'actor_type' => 'chain', 'approver_employee_id' => $signerEmployee->id, 'approver_name' => 'Signer',
            'status' => ApprovalStatus::Approved->value, 'acted_by_user_id' => $signer->id, 'acted_by_name' => 'Signer', 'acted_at' => now(),
        ]);

        $row = collect($this->actingAs($this->viewer)->getJson('/api/service-requests')->assertOk()->json('data'))->firstWhere('id', $request->id);

        $this->assertSame('ผู้ลงนาม', $row['activity']['by_th']);
        $this->assertSame('ผู้ลงนาม', $row['approvals'][0]['acted_by_name_th']);
    }
}
