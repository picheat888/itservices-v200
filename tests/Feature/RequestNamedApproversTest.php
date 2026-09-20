<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Models\Workflow\Workflow;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A department step that names PEOPLE rather than positions, and names more than one.
 *
 * Naming one person could only ever describe a route that stalls whenever that person is
 * away; naming positions opens the step to a whole rank, which is a different promise. So a
 * step may name several people, and they are alternates: the first to sign settles it, the
 * others are then holding nothing. Two signatures on one request means two steps.
 *
 * The other half of the feature is that being one of several is indistinguishable from
 * holding a step alone everywhere it matters — the badge, the "waiting on me" tab, and the
 * Approve button all have to see it, or the people named can decide a request they cannot
 * find.
 */
class RequestNamedApproversTest extends TestCase
{
    use RefreshDatabase;

    private Employee $requester;

    private Employee $sup;

    private Department $qc;

    private User $requesterUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);

        $this->qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        Department::create(['code' => 'DEP-SE', 'tag' => 'SE', 'name' => 'Safety']);
        $this->seed(WorkflowSeeder::class);

        $vp = Employee::create(['first_name' => 'Veep', 'position_id' => $this->positionId('Vice President')]);
        $this->sup = Employee::create([
            'first_name' => 'Sup', 'manager_id' => $vp->id, 'position_id' => $this->positionId('Supervisor'),
        ]);
        $this->requester = Employee::create([
            'first_name' => 'Asker', 'manager_id' => $this->sup->id, 'position_id' => $this->positionId('Staff/Officer'),
        ]);
        $this->requesterUser = $this->userFor($this->requester, ['requests.submit']);

        // The CCTV route's third step asks Safety; staffed so it behaves like the real one
        // rather than skipping, which would change what comes after the QC step.
        $this->staffIn(Department::where('tag', 'SE')->firstOrFail(), 'Supervisor', 'SeSup');
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

    /** Somebody in a department, at a position, with a login that may use the Request module. */
    private function staffIn(Department $department, string $title, string $name): Employee
    {
        $employee = Employee::create([
            'first_name' => $name, 'department_id' => $department->id, 'position_id' => $this->positionId($title),
        ]);
        $this->userFor($employee, ['requests.submit']);

        return $employee;
    }

    /** Point the CCTV route's QC step at these people instead of at a rung of positions. */
    private function qcStepNames(Employee ...$people): void
    {
        $step = Workflow::where('request_type', 'cctv')->firstOrFail()
            ->steps()->where('position', 2)->firstOrFail();
        $step->positions()->sync([]);
        $step->approvers()->sync(collect($people)->pluck('id')->all());
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

    /** Clear the first rung so the QC step becomes the one waiting on a decision. */
    private function passTheSupervisorRung(ServiceRequest $request): void
    {
        $this->actingAs($this->userFor($this->sup))
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
    }

    private function qcRow(ServiceRequest $request)
    {
        return $request->approvals()->where('position', 2)->firstOrFail();
    }

    public function test_a_step_naming_two_people_is_open_to_both_and_to_nobody_in_particular(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);

        $row = $this->qcRow($this->submitCctv());

        $this->assertNull($row->approver_employee_id);
        $this->assertSame([$boss->id, $deputy->id], $row->approver_employee_ids);
        $this->assertTrue($row->isOpenToNamedGroup());
        // Named people are not a department rung: the row carries no position criteria.
        $this->assertFalse($row->isOpenToDepartment());
    }

    public function test_either_named_person_may_sign_and_the_first_one_takes_the_row(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        // The deputy is second on the list and signs anyway — they are an alternate, not a
        // later step.
        $this->actingAs(User::where('employee_id', $deputy->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $row = $this->qcRow($request);
        $this->assertSame(ApprovalStatus::Approved, $row->status);
        $this->assertSame($deputy->id, $row->approver_employee_id);
        $this->assertSame('QcDeputy', $row->approver_name);
        // Taken, so it is no longer open to the group — the row reads like any other.
        $this->assertFalse($row->isOpenToNamedGroup());
    }

    public function test_once_one_of_them_has_signed_the_other_cannot(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        $this->actingAs(User::where('employee_id', $boss->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        // The request has moved on to Safety; the deputy has nothing left to sign here.
        $this->actingAs(User::where('employee_id', $deputy->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
    }

    public function test_somebody_the_step_does_not_name_is_refused_even_from_the_same_department(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        // A QC Manager exactly like the one named — and still not named. That is the whole
        // difference between naming people and naming a position.
        $unnamed = $this->staffIn($this->qc, 'Manager', 'QcOther');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        $this->actingAs(User::where('employee_id', $unnamed->id)->firstOrFail())
            ->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
    }

    public function test_naming_one_person_still_resolves_to_a_plain_single_approver_row(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $this->qcStepNames($boss);

        $row = $this->qcRow($this->submitCctv());

        $this->assertSame($boss->id, $row->approver_employee_id);
        $this->assertSame('QcBoss', $row->approver_name);
        $this->assertNull($row->approver_employee_ids);
        $this->assertFalse($row->isOpenToGroup());
    }

    public function test_a_named_person_who_has_left_is_dropped_and_the_rest_carry_the_step(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $boss->update(['status' => EmployeeStatus::Resigned->value]);

        $row = $this->qcRow($this->submitCctv());

        // One usable name left, so the row is an ordinary single-approver one.
        $this->assertSame($deputy->id, $row->approver_employee_id);
        $this->assertNull($row->approver_employee_ids);
    }

    public function test_a_step_whose_every_name_has_gone_is_skipped_with_a_reason(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $boss->update(['status' => EmployeeStatus::Resigned->value]);
        $deputy->update(['status' => EmployeeStatus::Resigned->value]);

        $row = $this->qcRow($this->submitCctv());

        $this->assertSame(ApprovalStatus::Skipped, $row->status);
        $this->assertSame(ApprovalSkipReason::NoDepartmentApprover, $row->skip_reason);
    }

    public function test_the_requester_is_never_one_of_their_own_approvers(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        // The person asking is named on the step. They are dropped, leaving the other name.
        $this->requester->update(['department_id' => $this->qc->id]);
        $this->qcStepNames($this->requester, $boss);

        $row = $this->qcRow($this->submitCctv());

        $this->assertSame($boss->id, $row->approver_employee_id);
    }

    public function test_both_named_people_can_find_the_request_that_waits_on_them(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        foreach ([$boss, $deputy] as $person) {
            $this->actingAs(User::where('employee_id', $person->id)->firstOrFail());

            // The tab they would click, the number on the card above it, and the badge in
            // the sidebar — a step open to a group has to register in all three, or it is
            // decidable but unfindable.
            $tab = $this->getJson('/api/service-requests?scope=approvals')->assertOk();
            $this->assertSame([$request->id], collect($tab->json('data'))->pluck('id')->all());
            $this->assertSame(1, $tab->json('meta.awaiting_me'));
            $this->assertSame(1, $this->getJson('/api/sidebar-badges')->assertOk()->json('data.requests'));

            // And the detail page offers them the button, not just the API.
            $detail = $this->getJson("/api/service-requests/{$request->id}")->assertOk();
            $this->assertTrue($detail->json('data.can_approve'));
            $this->assertSame(
                ['QcBoss', 'QcDeputy'],
                collect($detail->json('data.approvals'))->firstWhere('position', 2)['approver_candidates'],
            );
        }
    }

    public function test_somebody_the_step_does_not_name_is_not_shown_it(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $unnamed = $this->staffIn($this->qc, 'Manager', 'QcOther');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        $this->actingAs(User::where('employee_id', $unnamed->id)->firstOrFail());

        $this->assertSame([], $this->getJson('/api/service-requests?scope=approvals')->assertOk()->json('data'));
        $this->assertSame(0, $this->getJson('/api/sidebar-badges')->assertOk()->json('data.requests'));
        $this->getJson("/api/service-requests/{$request->id}")->assertForbidden();
    }

    public function test_everybody_named_is_told_the_step_is_waiting_on_them(): void
    {
        $boss = $this->staffIn($this->qc, 'Manager', 'QcBoss');
        $deputy = $this->staffIn($this->qc, 'Asst. Manager', 'QcDeputy');
        $this->qcStepNames($boss, $deputy);
        $request = $this->submitCctv();
        $this->passTheSupervisorRung($request);

        foreach ([$boss, $deputy] as $person) {
            $user = User::where('employee_id', $person->id)->firstOrFail();
            $this->assertTrue(
                $user->notifications()->get()->contains(fn ($n) => ($n->data['subtype'] ?? null) === 'waiting'),
                "{$person->first_name} was not told the step waits on them",
            );
        }
    }
}
