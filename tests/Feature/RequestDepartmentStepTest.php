<?php

namespace Tests\Feature;

use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestType;
use App\Enums\Ticket\TicketCategory;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Support\DefaultWorkflows;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Approval steps that ask a department to sign, rather than the requester's own line.
 *
 * A chain step climbs from the requester and matches on position, which cannot express
 * "QC signs this": QC is not above the person asking. A department step names the
 * department and either one person in it or the positions it accepts — and when it
 * accepts positions, whoever gets there first takes the row.
 */
class RequestDepartmentStepTest extends TestCase
{
    use RefreshDatabase;

    private Employee $requester;

    private Employee $sup;

    private Employee $vp;

    private Department $qc;

    private Department $safety;

    private User $requesterUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);

        $this->qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $this->safety = Department::create(['code' => 'DEP-SE', 'tag' => 'SE', 'name' => 'Safety']);
        $this->seed(WorkflowSeeder::class);

        // The requester's own line covers the first and last rungs of the CCTV route.
        $this->vp = Employee::create(['first_name' => 'Veep', 'position_id' => $this->positionId('Vice President')]);
        $this->sup = Employee::create([
            'first_name' => 'Sup', 'manager_id' => $this->vp->id, 'position_id' => $this->positionId('Supervisor'),
        ]);
        $this->requester = Employee::create([
            'first_name' => 'Asker', 'manager_id' => $this->sup->id, 'position_id' => $this->positionId('Staff/Officer'),
        ]);

        $this->requesterUser = $this->userFor($this->requester, ['requests.submit']);
    }

    private function positionId(string $title): int
    {
        return Position::where('title', $title)->firstOrFail()->id;
    }

    /** A login for this employee, on a role granted the listed permissions. */
    private function userFor(Employee $employee, array $permissions = []): User
    {
        $key = 'r'.$employee->id;
        $role = Role::firstOrCreate(['key' => $key], ['name' => $key, 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $p], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $key, 'employee_id' => $employee->id]);
    }

    /** Somebody in a department, at a position, with a login. */
    private function staffIn(Department $department, string $title, string $name): Employee
    {
        $employee = Employee::create([
            'first_name' => $name, 'department_id' => $department->id, 'position_id' => $this->positionId($title),
        ]);
        $this->userFor($employee);

        return $employee;
    }

    private function submitCctv(): ServiceRequest
    {
        $response = $this->actingAs($this->requesterUser)->postJson('/api/service-requests', [
            'type' => 'cctv',
            'title' => 'Camera over the loading bay',
            'reason' => 'Pallets have gone missing overnight and the bay has no coverage.',
            'fields' => [],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_the_route_runs_supervisor_qc_safety_executive_then_it(): void
    {
        $qcManager = $this->staffIn($this->qc, 'Manager', 'QcMgr');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');

        $steps = $this->submitCctv()->approvals()->orderBy('position')->get();

        $this->assertSame(
            ['chain', 'department', 'department', 'chain', 'it_staff'],
            $steps->pluck('actor_type')->map(fn ($t) => $t->value)->all(),
        );
        // The two chain rungs resolve to one person each, off the requester's own line.
        $this->assertSame($this->sup->id, $steps[0]->approver_employee_id);
        $this->assertSame($this->vp->id, $steps[3]->approver_employee_id);
        // The department steps name no single person: they carry the criteria instead.
        $this->assertNull($steps[1]->approver_employee_id);
        $this->assertSame($this->qc->id, $steps[1]->approver_department_id);
        $this->assertTrue($steps[1]->isOpenToDepartment());
        $this->assertSame($this->safety->id, $steps[2]->approver_department_id);
        $this->assertNotNull($qcManager);
    }

    public function test_anybody_in_the_department_at_an_accepted_position_may_sign(): void
    {
        $qcAsst = $this->staffIn($this->qc, 'Asst. Manager', 'QcAsst');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');
        $request = $this->submitCctv();

        // Clear the supervisor rung so the QC step becomes the current one.
        $this->actingAs($this->userFor($this->sup))
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->actingAs(User::where('employee_id', $qcAsst->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $row = $request->approvals()->where('position', 2)->firstOrFail();
        $this->assertSame(ApprovalStatus::Approved, $row->status);
        // Acting takes the row: it stops being a group step and reads like any other.
        $this->assertSame($qcAsst->id, $row->approver_employee_id);
        $this->assertFalse($row->isOpenToDepartment());
    }

    public function test_the_right_position_in_the_wrong_department_is_refused(): void
    {
        $this->staffIn($this->qc, 'Manager', 'QcMgr');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');
        // A Manager, but in Safety — the QC step is not theirs to sign.
        $outsider = $this->staffIn($this->safety, 'Manager', 'SeMgr');
        $request = $this->submitCctv();

        $this->actingAs($this->userFor($this->sup))
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->actingAs(User::where('employee_id', $outsider->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
    }

    public function test_the_wrong_position_in_the_right_department_is_refused(): void
    {
        $this->staffIn($this->qc, 'Manager', 'QcMgr');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');
        // QC, but a Leader — below every position the step accepts.
        $tooJunior = $this->staffIn($this->qc, 'Leader', 'QcLeader');
        $request = $this->submitCctv();

        $this->actingAs($this->userFor($this->sup))
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->actingAs(User::where('employee_id', $tooJunior->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
    }

    public function test_once_one_of_the_group_has_signed_the_others_cannot(): void
    {
        $first = $this->staffIn($this->qc, 'Manager', 'QcOne');
        $second = $this->staffIn($this->qc, 'Asst. Manager', 'QcTwo');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');
        $request = $this->submitCctv();

        $this->actingAs($this->userFor($this->sup))
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs(User::where('employee_id', $first->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        // The step has moved on to Safety, so the second QC manager has nothing to sign.
        $this->actingAs(User::where('employee_id', $second->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
    }

    public function test_a_department_with_nobody_at_those_positions_is_skipped_with_a_reason(): void
    {
        // Safety is staffed, QC holds only a Leader — below everything the step accepts.
        $this->staffIn($this->qc, 'Leader', 'QcLeader');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');

        $row = $this->submitCctv()->approvals()->where('position', 2)->firstOrFail();

        $this->assertSame(ApprovalStatus::Skipped, $row->status);
        $this->assertSame(ApprovalSkipReason::NoDepartmentApprover, $row->skip_reason);
    }

    public function test_the_requester_never_signs_their_own_department_step(): void
    {
        // The person asking is themself a QC Manager. The step they would otherwise sign
        // is skipped rather than handed to them.
        $this->requester->update(['department_id' => $this->qc->id, 'position_id' => $this->positionId('Manager')]);
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');

        $row = $this->submitCctv()->approvals()->where('position', 2)->firstOrFail();

        $this->assertSame(ApprovalStatus::Skipped, $row->status);
        $this->assertSame(ApprovalSkipReason::NoDepartmentApprover, $row->skip_reason);
    }

    public function test_editing_the_workflow_does_not_change_a_request_already_in_flight(): void
    {
        $this->staffIn($this->qc, 'Manager', 'QcMgr');
        $this->staffIn($this->safety, 'Supervisor', 'SeSup');
        $request = $this->submitCctv();
        $before = $request->approvals()->where('position', 2)->firstOrFail();

        // Point the QC step at Safety instead, after the request was submitted.
        $step = $request->workflow->steps()->where('position', 2)->firstOrFail();
        $step->update(['department_id' => $this->safety->id]);

        $after = $request->approvals()->where('position', 2)->firstOrFail();
        $this->assertSame($before->approver_department_id, $after->approver_department_id);
        $this->assertSame($this->qc->id, $after->approver_department_id);
    }

    public function test_a_cctv_request_opens_a_cctv_ticket(): void
    {
        $this->assertSame(TicketCategory::Cctv, RequestType::Cctv->ticketCategory());
        $this->assertTrue(DefaultWorkflows::all()[RequestType::Cctv->value]['auto_ticket']);
    }
}
