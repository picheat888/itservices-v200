<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalSkipReason;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestType;
use App\Models\Access\FileShare;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Request\WorkflowResolverService;
use Database\Seeders\PositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * WorkflowResolverService: how workflow steps freeze into concrete approval
 * rows — positional chain resolution, short-chain merging, skip rules, and
 * owner resolution from Access resources.
 */
class RequestResolutionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Positions first: WorkflowSeeder attaches them to the chain rungs, which is
        // what the routing depends on.
        $this->seed(PositionSeeder::class);
        $this->seed(WorkflowSeeder::class);
    }

    /** An active employee with a linked login (eligible as an approver). */
    private function employee(string $name, ?int $managerId = null, ?int $positionId = null): Employee
    {
        $employee = Employee::create(['first_name' => $name, 'manager_id' => $managerId, 'position_id' => $positionId]);
        User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);

        return $employee;
    }

    private function resolve(string $type, Employee $requester, array $fields = []): Collection
    {
        $workflow = Workflow::where('request_type', $type)->firstOrFail();

        return app(WorkflowResolverService::class)->resolve($workflow, $requester, $fields);
    }

    /**
     * The real org ladder, as the Workflow module now routes against it: a chain step
     * names the positions that may sign it, and the resolver climbs the reporting line
     * looking for a holder — instead of taking the Nth manager whoever they are.
     *
     * @return array{0: Employee, 1: array<string, Employee>, 2: array<string, list<int>>}
     */
    private function ladder(): array
    {
        // The real titles, from PositionSeeder — the same rows the workflow rungs name.
        $titles = [
            'vp' => 'Vice President', 'director' => 'Director', 'srMgr' => 'Senior Manager',
            'mgr' => 'Manager', 'asstMgr' => 'Asst. Manager', 'srSup' => 'Senior Supervisor',
            'sup' => 'Supervisor', 'asstSup' => 'Asst. Supervisor', 'leader' => 'Leader', 'staff' => 'Staff/Officer',
        ];
        $positions = [];
        foreach ($titles as $key => $title) {
            $positions[$key] = Position::where('title', $title)->firstOrFail();
        }

        // Staff → Leader → Supervisor → Manager → VP, everybody able to sign in.
        $vp = $this->employee('Vp', null, $positions['vp']->id);
        $mgr = $this->employee('Mgr', $vp->id, $positions['mgr']->id);
        $sup = $this->employee('Sup', $mgr->id, $positions['sup']->id);
        $leader = $this->employee('Leader', $sup->id, $positions['leader']->id);
        $staff = $this->employee('Staff', $leader->id, $positions['staff']->id);

        return [
            $staff,
            compact('vp', 'mgr', 'sup', 'leader'),
            [
                'supervisor' => [$positions['asstSup']->id, $positions['sup']->id, $positions['srSup']->id],
                'manager' => [$positions['asstMgr']->id, $positions['mgr']->id, $positions['srMgr']->id],
                'executive' => [$positions['vp']->id, $positions['director']->id],
            ],
        ];
    }

    /**
     * @param  array<string, list<int>>  $levels  position ids per named level
     * @return list<array<string, mixed>>
     */
    private function ladderSteps(array $levels, string ...$wanted): array
    {
        $steps = [];
        foreach ($wanted as $level) {
            $steps[] = ['actor_type' => 'chain', 'label' => ucfirst($level), 'kind' => 'approval', 'position_ids' => $levels[$level]];
        }
        $steps[] = ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment'];

        return $steps;
    }

    public function test_a_chain_step_resolves_to_the_manager_who_holds_one_of_its_positions(): void
    {
        [$staff, $people, $levels] = $this->ladder();

        $rows = app(WorkflowResolverService::class)->resolveSteps(
            RequestType::Computer,
            $this->ladderSteps($levels, 'supervisor', 'manager', 'executive'),
            $staff,
        );

        // The Leader sits between Staff and Supervisor and signs nothing: no step asked
        // for that level, which is exactly the complaint the old positional rule caused.
        $this->assertSame(['Sup', 'Mgr', 'Vp', null], $rows->pluck('approver_name')->all());
        $this->assertNotContains($people['leader']->id, $rows->pluck('approver_employee_id')->all());
    }

    public function test_a_step_whose_positions_are_absent_from_the_line_is_skipped(): void
    {
        [, $people, $levels] = $this->ladder();

        // The Supervisor files it themselves — nobody above them is a Supervisor, so
        // that level is skipped rather than handed to somebody who is not one.
        $rows = app(WorkflowResolverService::class)->resolveSteps(
            RequestType::Computer,
            $this->ladderSteps($levels, 'supervisor', 'manager'),
            $people['sup'],
        );

        $supervisorStep = $rows->firstWhere('label', 'Supervisor');
        $this->assertSame(ApprovalStatus::Skipped->value, $supervisorStep['status']);
        $this->assertSame(ApprovalSkipReason::NoMatchingPosition->value, $supervisorStep['skip_reason']);
        $this->assertSame('Mgr', $rows->firstWhere('label', 'Manager')['approver_name']);
    }

    public function test_when_no_step_matches_anybody_the_top_of_the_line_still_signs(): void
    {
        [, , $levels] = $this->ladder();
        $lead = Position::where('title', 'Leader')->firstOrFail();
        $soloBoss = $this->employee('SoloBoss', null, $lead->id);
        $junior = $this->employee('Junior', $soloBoss->id, Position::where('title', 'Staff/Officer')->firstOrFail()->id);

        $rows = app(WorkflowResolverService::class)->resolveSteps(
            RequestType::Computer,
            $this->ladderSteps($levels, 'supervisor', 'manager'),
            $junior,
        );

        // No Supervisor and no Manager above them — but a request must not approve
        // itself, so the highest person in the line carries it.
        $this->assertSame([$soloBoss->id], $rows->pluck('approver_employee_id')->filter()->values()->all());
    }

    public function test_the_seeded_route_reaches_the_supervisor_the_manager_and_the_vp(): void
    {
        [$staff] = $this->ladder();

        // social: 3 chain rungs + IT fulfillment, positions attached by the seeder.
        $rows = $this->resolve('social', $staff);

        $this->assertCount(4, $rows);
        $this->assertSame(['Sup', 'Mgr', 'Vp'], $rows->take(3)->pluck('approver_name')->all());
        $this->assertSame('it_staff', $rows->last()['actor_type']);
        $this->assertNull($rows->last()['approver_employee_id']);
    }

    public function test_a_line_missing_a_rung_skips_that_rung_and_still_reaches_the_others(): void
    {
        $mgrTitle = Position::where('title', 'Manager')->firstOrFail();
        $boss = $this->employee('Boss', null, $mgrTitle->id);
        $staff = $this->employee('Staff', $boss->id, Position::where('title', 'Staff/Officer')->firstOrFail()->id);

        // social asks for Supervisor, Manager and VP; this line holds only a Manager.
        $rows = $this->resolve('social', $staff);

        $this->assertSame($boss->id, $rows->firstWhere('label', 'Manager / Asst. Manager')['approver_employee_id']);
        foreach (['Supervisor', 'Vice President'] as $emptyRung) {
            $row = $rows->firstWhere('label', $emptyRung);
            $this->assertSame(ApprovalStatus::Skipped->value, $row['status']);
            $this->assertSame(ApprovalSkipReason::NoMatchingPosition->value, $row['skip_reason']);
        }
    }

    public function test_a_rung_never_reuses_the_person_who_signed_the_rung_below(): void
    {
        $mgr = Position::where('title', 'Manager')->firstOrFail();
        $boss = $this->employee('Boss', null, $mgr->id);
        $staff = $this->employee('Staff', $boss->id);

        // Two rungs naming the same title: rungs are levels, so the search for the
        // second one starts ABOVE whoever signed the first. One person is not two
        // levels of approval.
        $rows = app(WorkflowResolverService::class)->resolveSteps(RequestType::Computer, [
            ['actor_type' => 'chain', 'label' => 'First', 'kind' => 'approval', 'position_ids' => [$mgr->id]],
            ['actor_type' => 'chain', 'label' => 'Second', 'kind' => 'approval', 'position_ids' => [$mgr->id]],
            ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment'],
        ], $staff);

        $this->assertSame($boss->id, $rows->firstWhere('label', 'First')['approver_employee_id']);
        $this->assertSame(ApprovalSkipReason::NoMatchingPosition->value, $rows->firstWhere('label', 'Second')['skip_reason']);
    }

    public function test_consecutive_rows_resolving_to_one_person_merge_into_a_single_decision(): void
    {
        $supTitle = Position::where('title', 'Supervisor')->firstOrFail();
        $sup = $this->employee('Sup', null, $supTitle->id);
        $staff = $this->employee('Staff', $sup->id);
        // The share's owner happens to be the requester's own supervisor.
        $share = FileShare::create(['code' => 'FS-M1', 'name' => 'Team', 'path' => '\\\\FILES\\TEAM', 'owner_employee_id' => $sup->id]);

        $rows = app(WorkflowResolverService::class)->resolveSteps(RequestType::Fileshare, [
            ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'position_ids' => [$supTitle->id]],
            ['actor_type' => 'owner', 'label' => 'Resource Owner', 'kind' => 'approval'],
            ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment'],
        ], $staff, ['file_share_id' => $share->id]);

        // Asking one person to press Approve twice is not two approvals.
        $this->assertCount(2, $rows);
        $merged = $rows->first();
        $this->assertSame($sup->id, $merged['approver_employee_id']);
        $this->assertSame('Supervisor · Resource Owner', $merged['label']);
        // The joined label already lists both, so nothing is written into note.
        $this->assertNull($merged['note']);
        $this->assertSame([1, 2], $rows->pluck('position')->all());
    }

    public function test_no_manager_collapses_the_chain_into_one_skipped_row(): void
    {
        $solo = $this->employee('Solo');

        $rows = $this->resolve('computer', $solo);

        $skipped = $rows->first();
        $this->assertSame(ApprovalStatus::Skipped->value, $skipped['status']);
        $this->assertNull($skipped['approver_employee_id']);
        // A code, not a sentence: the SPA writes it in the reader's language, and
        // `note` stays for what a person actually typed.
        $this->assertSame(ApprovalSkipReason::NoManager->value, $skipped['skip_reason']);
        $this->assertNull($skipped['note']);
        $this->assertSame('it_staff', $rows->last()['actor_type']);
    }

    public function test_a_manager_without_a_login_keeps_the_step_and_the_request_waits(): void
    {
        $supTitle = Position::where('title', 'Supervisor')->firstOrFail()->id;
        $mgrTitle = Position::where('title', 'Manager')->firstOrFail()->id;
        $mgr = $this->employee('Mgr', null, $mgrTitle);
        // Holds the rung the request needs, but the account is not provisioned yet.
        $noAccount = Employee::create(['first_name' => 'NoAccount', 'manager_id' => $mgr->id, 'position_id' => $supTitle]);
        $staff = $this->employee('Staff', $noAccount->id);

        $rows = $this->resolve('computer', $staff); // Supervisor + Manager rungs

        // The rung belongs to the actual holder and waits until they can sign in.
        // Passing it up to the Manager would be an approval they never gave.
        $this->assertSame($noAccount->id, $rows->first()['approver_employee_id']);
        $this->assertSame(ApprovalStatus::Waiting->value, $rows->first()['status']);
        $this->assertSame($mgr->id, $rows->get(1)['approver_employee_id']);
        // The missing account is NOT written onto the row: it stops being true the
        // moment the account is created, and a snapshot would keep claiming it.
        $this->assertNull($rows->first()['note']);
    }

    public function test_a_resigned_holder_is_passed_over_for_the_next_one_up(): void
    {
        $supTitle = Position::where('title', 'Supervisor')->firstOrFail()->id;
        $srSupTitle = Position::where('title', 'Senior Supervisor')->firstOrFail()->id;
        $senior = $this->employee('SeniorSup', null, $srSupTitle);
        $gone = Employee::create([
            'first_name' => 'Gone', 'manager_id' => $senior->id,
            'position_id' => $supTitle, 'status' => EmployeeStatus::Resigned,
        ]);
        $staff = $this->employee('Staff', $gone->id);

        $rows = $this->resolve('computer', $staff);

        // Both hold the Supervisor rung, but the resigned one is never coming back to
        // act — the opposite of an account that simply has not been created yet.
        $this->assertSame($senior->id, $rows->first()['approver_employee_id']);
    }

    public function test_owner_step_resolves_from_the_selected_resource(): void
    {
        $owner = $this->employee('Owner');
        $boss = $this->employee('Boss');
        $staff = $this->employee('Staff', $boss->id);
        $share = FileShare::create(['code' => 'FS-T1', 'name' => 'QA Share', 'path' => '\\\\FILES\\QA', 'owner_employee_id' => $owner->id]);

        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $share->id]);

        $this->assertSame($owner->id, $rows->first()['approver_employee_id']);
        $this->assertSame(ApprovalStatus::Waiting->value, $rows->first()['status']);
    }

    public function test_owner_step_is_skipped_when_unresolvable_or_self(): void
    {
        $boss = $this->employee('Boss');
        $staff = $this->employee('Staff', $boss->id);

        // No owner on the resource.
        $orphan = FileShare::create(['code' => 'FS-T2', 'name' => 'Orphan', 'path' => '\\\\FILES\\ORPHAN']);
        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $orphan->id]);
        $this->assertSame(ApprovalStatus::Skipped->value, $rows->first()['status']);
        $this->assertSame(ApprovalSkipReason::NoResourceOwner->value, $rows->first()['skip_reason']);

        // Requester owns the resource themself.
        $own = FileShare::create(['code' => 'FS-T3', 'name' => 'Own', 'path' => '\\\\FILES\\OWN', 'owner_employee_id' => $staff->id]);
        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $own->id]);
        $this->assertSame(ApprovalStatus::Skipped->value, $rows->first()['status']);
        // Distinct from "no owner": the owner IS set, they are just the one asking.
        $this->assertSame(ApprovalSkipReason::RequesterIsOwner->value, $rows->first()['skip_reason']);
        $this->assertNull($rows->first()['note']);
    }
}
