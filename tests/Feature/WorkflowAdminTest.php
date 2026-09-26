<?php

namespace Tests\Feature;

use App\Enums\Request\RequestStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Support\DefaultWorkflows;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Workflows admin surface: reading is gated by workflows.module and rewriting a
 * chain by workflows.manage, steps are replaced with shape validation, and a preview
 * resolves the step list along a real reporting line.
 */
class WorkflowAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        $role = Role::firstOrCreate(['key' => 'wfadmin', 'name' => 'WF Admin', 'color' => '#000', 'is_system' => false]);
        foreach (['workflows.module', 'workflows.manage'] as $permission) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }
        $this->admin = User::factory()->create(['role' => 'wfadmin']);
    }

    public function test_endpoints_require_the_workflow_permissions(): void
    {
        $plain = User::factory()->create(['role' => 'nobody']);
        $workflow = Workflow::firstOrFail();

        $this->actingAs($plain)->getJson('/api/workflows')->assertForbidden();
        $this->actingAs($plain)->putJson("/api/workflows/{$workflow->id}", [])->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/workflows')
            ->assertOk()->assertJsonCount(count(DefaultWorkflows::all()), 'data');
    }

    /** The master opens the screen; rewriting a chain is a second decision on top of it. */
    public function test_reading_the_chains_does_not_carry_the_right_to_change_them(): void
    {
        $role = Role::firstOrCreate(['key' => 'wfreader', 'name' => 'WF Reader', 'color' => '#000', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'workflows.module'], ['allowed' => true]);
        $reader = User::factory()->create(['role' => 'wfreader']);
        $workflow = Workflow::firstOrFail();

        $this->actingAs($reader)->getJson('/api/workflows')->assertOk();
        $this->actingAs($reader)->putJson("/api/workflows/{$workflow->id}", [])->assertForbidden();
    }

    public function test_update_replaces_steps_and_validates_the_shape(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();

        // No approval step at all.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'completion']],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // Completion not last.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                ['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'completion'],
                ['actor_type' => 'chain', 'label' => 'Boss', 'kind' => 'approval'],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // Owner step on a type whose resources carry no owner.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [['actor_type' => 'owner', 'label' => 'Owner', 'kind' => 'approval']],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps');

        // A valid replacement persists in order with renumbered positions.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'name' => 'Hardware Request',
            'active' => true,
            'auto_ticket' => false,
            'steps' => [
                [
                    'actor_type' => 'chain', 'label' => 'Team Lead', 'kind' => 'approval',
                    'position_ids' => [Position::where('title', 'Supervisor')->firstOrFail()->id],
                ],
                [
                    'actor_type' => 'chain', 'label' => 'Director', 'kind' => 'approval',
                    'position_ids' => [Position::where('title', 'Director')->firstOrFail()->id],
                ],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.name', 'Hardware Request')
            ->assertJsonPath('data.auto_ticket', false)
            ->assertJsonPath('data.steps.0.label', 'Team Lead')
            ->assertJsonPath('data.steps.2.kind', 'completion');

        $this->assertSame([1, 2, 3], $workflow->fresh()->steps->pluck('position')->all());
    }

    public function test_a_department_step_saves_its_department_and_its_group(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $manager = Position::where('title', 'Manager')->firstOrFail();

        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                [
                    'actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval',
                    'department_id' => $qc->id, 'position_ids' => [$manager->id],
                ],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk();

        $step = $workflow->fresh()->steps()->where('position', 1)->firstOrFail();
        $this->assertSame($qc->id, $step->department_id);
        $this->assertSame([], $step->approvers->pluck('id')->all());
        $this->assertSame([$manager->id], $step->positions->pluck('id')->all());
    }

    public function test_a_department_step_can_name_people_instead(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $boss = Employee::create(['first_name' => 'QcBoss', 'department_id' => $qc->id]);
        $deputy = Employee::create(['first_name' => 'QcDeputy', 'department_id' => $qc->id]);

        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                [
                    'actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval',
                    'department_id' => $qc->id, 'approver_employee_ids' => [$boss->id, $deputy->id],
                ],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk()
            // The order they were named in survives the round trip: the first is who the
            // route means to ask, the rest are stand-ins.
            ->assertJsonPath('data.steps.0.approvers.0.name', 'QcBoss')
            ->assertJsonPath('data.steps.0.approvers.1.name', 'QcDeputy');

        $step = $workflow->fresh()->steps()->where('position', 1)->firstOrFail();
        $this->assertSame([$boss->id, $deputy->id], $step->approvers->pluck('id')->all());
        $this->assertSame([], $step->positions->pluck('id')->all());
    }

    /** Naming somebody from another department would be a step its own department cannot sign. */
    public function test_a_department_step_refuses_a_person_from_another_department(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $safety = Department::create(['code' => 'DEP-SE', 'tag' => 'SE', 'name' => 'Safety']);
        $inQc = Employee::create(['first_name' => 'QcBoss', 'department_id' => $qc->id]);
        $outsider = Employee::create(['first_name' => 'SeBoss', 'department_id' => $safety->id]);

        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                [
                    'actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval',
                    'department_id' => $qc->id, 'approver_employee_ids' => [$inQc->id, $outsider->id],
                ],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps.0.approver_employee_ids');
    }

    /** A department step that says neither who nor where can never resolve, so it is refused. */
    public function test_a_department_step_must_say_which_department_and_who_in_it(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $completion = ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'];

        // No department at all.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [['actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval'], $completion],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps.0.department_id');

        // A department, but neither a person nor any position in it.
        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                ['actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval', 'department_id' => $qc->id],
                $completion,
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps.0.position_ids');
    }

    public function test_the_list_reports_how_long_each_route_actually_took(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $employee = Employee::create(['first_name' => 'Asker']);

        // Two requests on this route: one decided two days after it was filed, one
        // decided four — and a third decided before the window, which must not count.
        $this->decidedRequest($workflow, $employee, filedDaysAgo: 5, decidedDaysAgo: 3);
        $this->decidedRequest($workflow, $employee, filedDaysAgo: 6, decidedDaysAgo: 2);
        $this->decidedRequest($workflow, $employee, filedDaysAgo: 120, decidedDaysAgo: 118);

        $response = $this->actingAs($this->admin)->getJson('/api/workflows')->assertOk();

        $this->assertSame(30, $response->json('meta.measure_days'));
        $measured = collect($response->json('data'))->firstWhere('request_type', 'computer')['measured'];
        // (2 + 4) / 2 — compared loosely because JSON renders 3.0 as 3.
        $this->assertEqualsWithDelta(3.0, $measured['avg_days'], 0.001);
        $this->assertSame(2, $measured['requests']);
    }

    public function test_a_route_nothing_ran_through_reports_no_measurement(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/workflows')->assertOk();

        // Absent rather than zero — zero days would read as "decided instantly".
        $this->assertNull(collect($response->json('data'))->firstWhere('request_type', 'mobile')['measured']);
    }

    /** A request on $workflow that was filed and decided the given number of days ago. */
    private function decidedRequest(Workflow $workflow, Employee $employee, int $filedDaysAgo, int $decidedDaysAgo): void
    {
        $request = ServiceRequest::create([
            'type' => $workflow->request_type->value,
            'workflow_id' => $workflow->id,
            'employee_id' => $employee->id,
            'requester_name' => $employee->name,
            'title' => 'Measured request',
            'reason' => 'Measured request',
            'status' => RequestStatus::Approved->value,
            'approved_at' => now()->subDays($decidedDaysAgo),
        ]);

        // created_at is not fillable (Laravel stamps it), so back-date it afterwards —
        // which is the whole point of these rows.
        $request->forceFill(['created_at' => now()->subDays($filedDaysAgo)])->saveQuietly();
    }

    public function test_preview_resolves_each_rung_to_its_position_holder(): void
    {
        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $vp = Employee::create(['first_name' => 'Vp', 'position_id' => $title('Vice President')]);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $vp->id, 'position_id' => $title('Supervisor')]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $title('Staff/Officer')]);
        foreach ([$vp, $sup] as $e) {
            User::factory()->create(['role' => 'nobody', 'employee_id' => $e->id]);
        }

        $response = $this->actingAs($this->admin)->postJson('/api/workflows/preview', [
            'request_type' => 'computer',
            'employee_id' => $staff->id,
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'position_ids' => [$title('Supervisor')]],
                ['actor_type' => 'chain', 'label' => 'Manager', 'kind' => 'approval', 'position_ids' => [$title('Manager')]],
                ['actor_type' => 'chain', 'label' => 'VP', 'kind' => 'approval', 'position_ids' => [$title('Vice President')]],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk();

        $rows = collect($response->json('data.rows'));
        // Supervisor and VP are in the line; nobody holds Manager, so that rung is
        // skipped rather than handed to the VP over the requester's head.
        $this->assertSame('Sup', $rows->firstWhere('label', 'Supervisor')['approver_name']);
        $this->assertSame('Vp', $rows->firstWhere('label', 'VP')['approver_name']);
        $this->assertSame('no_matching_position', $rows->firstWhere('label', 'Manager')['skip_reason']);
        $this->assertSame('it_staff', $rows->last()['actor_type']);
        $this->assertSame('Staff', $response->json('data.employee.name'));
    }

    /**
     * The preview has to answer for a department step too — it resolves from the department
     * and the people named, and neither used to be sent, so every department step previewed
     * as skipped whatever it actually said.
     */
    public function test_preview_shows_who_a_department_step_naming_people_would_reach(): void
    {
        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $staff = Employee::create(['first_name' => 'Staff', 'position_id' => $title('Staff/Officer')]);
        $qc = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        $boss = Employee::create(['first_name' => 'QcBoss', 'department_id' => $qc->id, 'position_id' => $title('Manager')]);
        $deputy = Employee::create(['first_name' => 'QcDeputy', 'department_id' => $qc->id, 'position_id' => $title('Asst. Manager')]);

        $response = $this->actingAs($this->admin)->postJson('/api/workflows/preview', [
            'request_type' => 'computer',
            'employee_id' => $staff->id,
            'steps' => [
                [
                    'actor_type' => 'department', 'label' => 'QC Dept.', 'kind' => 'approval',
                    'department_id' => $qc->id, 'approver_employee_ids' => [$boss->id, $deputy->id],
                ],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk();

        $row = collect($response->json('data.rows'))->firstWhere('label', 'QC Dept.');
        $this->assertSame('waiting', $row['status']);
        $this->assertNull($row['approver_employee_id']);
        // Named, in the order the step names them — that is what the editor prints back.
        $this->assertSame(['QcBoss', 'QcDeputy'], $row['approver_candidates']);
    }

    public function test_reseeding_fills_rungs_that_have_no_positions_yet(): void
    {
        // An install whose workflows predate position routing: the steps exist, the
        // rungs are empty, so nothing would resolve.
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $supervisorRung = $workflow->steps()->where('label', 'Supervisor')->firstOrFail();
        $managerRung = $workflow->steps()->where('label', 'Manager / Asst. Manager')->firstOrFail();
        $supervisorRung->positions()->detach();
        // An administrator already narrowed this one down; re-seeding must not widen it.
        $managerRung->positions()->sync([Position::where('title', 'Manager')->firstOrFail()->id]);

        $this->seed(WorkflowSeeder::class);

        $this->assertEqualsCanonicalizing(
            ['Asst. Supervisor', 'Supervisor', 'Senior Supervisor'],
            $supervisorRung->fresh()->positions->pluck('title')->all(),
        );
        $this->assertSame(['Manager'], $managerRung->fresh()->positions->pluck('title')->all());
    }

    public function test_a_chain_step_without_positions_is_rejected(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();

        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Somebody', 'kind' => 'approval'],
                ['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'completion'],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('steps.0.position_ids');
    }

    public function test_update_stores_the_positions_of_each_rung(): void
    {
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $supervisorRung = Position::whereIn('title', ['Asst. Supervisor', 'Supervisor', 'Senior Supervisor'])->pluck('id');

        $this->actingAs($this->admin)->putJson("/api/workflows/{$workflow->id}", [
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Supervisor rung', 'kind' => 'approval', 'position_ids' => $supervisorRung->all()],
                ['actor_type' => 'it_staff', 'label' => 'IT', 'kind' => 'completion'],
            ],
        ])->assertOk()->assertJsonCount(3, 'data.steps.0.positions');

        $saved = $workflow->fresh()->steps()->with('positions')->orderBy('position')->get();
        $this->assertEqualsCanonicalizing($supervisorRung->all(), $saved[0]->positions->pluck('id')->all());
        // The completion step keeps none — positions only mean something on a rung.
        $this->assertCount(0, $saved[1]->positions);
    }
}
