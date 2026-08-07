<?php

namespace Tests\Feature;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Employee\EmployeeService;
use Database\Seeders\PositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The onboarding services picked while adding an employee: HR files the requests,
 * but they belong to the new employee, so the approval chain has to walk THEIR
 * reporting line and every approver has to be able to see whose request it is.
 */
class EmployeeOnboardingRequestTest extends TestCase
{
    use RefreshDatabase;

    private Employee $director;

    private Employee $itManager;

    private Employee $hrManager;

    private Employee $hrOfficer;

    private User $hrUser;

    private Department $it;

    private Section $support;

    private Position $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PositionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        $this->it = Department::create(['code' => 'DEP-0003', 'tag' => 'It', 'name' => 'Information Technology']);
        $this->support = Section::create(['code' => 'SEC-0002', 'department_id' => $this->it->id, 'name' => 'Support']);
        $this->staff = Position::where('title', 'Staff/Officer')->firstOrFail();
        $vp = Position::where('title', 'Vice President')->firstOrFail();
        $manager = Position::where('title', 'Manager')->firstOrFail();

        // Two separate reporting lines, so "whose manager approves this" is provable.
        // Both managers hold the Manager rung the Computer/Email routes ask for:
        //   new employee → itManager → director
        //   hrOfficer    → hrManager → director
        $this->director = Employee::create(['first_name' => 'Dir', 'position_id' => $vp->id]);
        $this->itManager = Employee::create([
            'first_name' => 'ItMgr', 'manager_id' => $this->director->id, 'position_id' => $manager->id,
        ]);
        $this->hrManager = Employee::create([
            'first_name' => 'HrMgr', 'manager_id' => $this->director->id, 'position_id' => $manager->id,
        ]);
        $this->hrOfficer = Employee::create([
            'first_name' => 'HrOfficer', 'manager_id' => $this->hrManager->id, 'position_id' => $this->staff->id,
        ]);

        // Approvers only count when they can sign in, so everyone in both lines gets a login.
        $this->makeUser('user', [], $this->director);
        $this->makeUser('user', [], $this->itManager);
        $this->makeUser('user', [], $this->hrManager);

        // Filing onboarding requests rides on the permission HR already needs to add
        // the person — it is not a Request-module action.
        $this->hrUser = $this->makeUser('hr', ['employees.add', 'employees.view'], $this->hrOfficer);
    }

    /** A user on the given role key, with the role granted the listed permissions. */
    private function makeUser(string $roleKey, array $permissions = [], ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(
            ['key' => $roleKey],
            ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false],
        );
        foreach ($permissions as $permission) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    /**
     * Adds an employee the way the Add Employee dialog does, with the onboarding
     * services ticked.
     *
     * @param  list<string>  $services
     */
    private function addEmployee(array $services, ?string $note = null): TestResponse
    {
        return $this->actingAs($this->hrUser)->postJson('/api/employees', [
            'first_name' => 'Somchai',
            'last_name' => 'Jaidee',
            'department_id' => $this->it->id,
            'section_id' => $this->support->id,
            'position_id' => $this->staff->id,
            'manager_id' => $this->itManager->id,
            'joined_at' => '2026-09-01',
            'services' => $services,
            'onboarding_note' => $note,
        ]);
    }

    /** Position of the rung the new employee's manager holds, in the approvals array. */
    private function managerRungIndex(ServiceRequest $request): int
    {
        return $request->approvals->search(fn ($row) => $row->approver_employee_id === $this->itManager->id);
    }

    /**
     * The request types on file, as strings — `type` is cast to an enum on the model.
     *
     * @return list<string>
     */
    private function filedTypes(): array
    {
        return ServiceRequest::all()->map(fn (ServiceRequest $r) => $r->type->value)->all();
    }

    public function test_each_ticked_service_becomes_its_own_request(): void
    {
        $this->addEmployee(['computer', 'email'])->assertCreated();

        $this->assertSame(2, ServiceRequest::count());
        $this->assertEqualsCanonicalizing(['computer', 'email'], $this->filedTypes());
    }

    public function test_nothing_is_filed_when_no_service_is_ticked(): void
    {
        $this->addEmployee([])->assertCreated();

        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_the_request_belongs_to_the_new_employee_and_names_who_filed_it(): void
    {
        $this->addEmployee(['computer'])->assertCreated();

        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $request = ServiceRequest::firstOrFail();

        // Owner: the new employee, who has no login of their own yet.
        $this->assertSame($employee->id, $request->employee_id);
        $this->assertNull($request->user_id);
        $this->assertSame($employee->name, $request->requester_name);
        $this->assertSame('Information Technology', $request->department_name);

        // Provenance: the account that actually pressed Save.
        $this->assertSame(RequestOrigin::Onboarding, $request->origin);
        $this->assertSame($this->hrUser->id, $request->submitted_by_user_id);
        $this->assertSame($this->hrUser->name, $request->submitted_by_name);
    }

    public function test_the_chain_walks_the_new_employees_manager_not_the_filers(): void
    {
        $this->addEmployee(['computer'])->assertCreated();

        $first = ServiceRequest::firstOrFail()->approvals()
            ->where('status', ApprovalStatus::Current->value)
            ->firstOrFail();

        $this->assertSame($this->itManager->id, $first->approver_employee_id);
        $this->assertNotSame($this->hrManager->id, $first->approver_employee_id);
    }

    public function test_the_note_carries_into_the_request_reason(): void
    {
        $this->addEmployee(['computer'], 'Needs a laptop with 32GB for the QA suite.')->assertCreated();

        $this->assertStringContainsString('32GB', ServiceRequest::firstOrFail()->reason);
    }

    public function test_an_inactive_workflow_does_not_cost_us_the_employee(): void
    {
        Workflow::where('request_type', 'computer')->update(['active' => false]);

        $response = $this->addEmployee(['computer', 'email'])->assertCreated();

        // The person is hired either way — a closed workflow is not a reason to lose them.
        $this->assertSame(1, Employee::where('first_name', 'Somchai')->count());
        $this->assertSame(['email'], $this->filedTypes());
        // …and the response says plainly which service could not be filed.
        $this->assertSame(['computer'], $response->json('onboarding.failed.*.service'));
        $this->assertCount(1, $response->json('onboarding.created'));
    }

    public function test_the_api_tells_approvers_the_request_is_for_a_new_employee(): void
    {
        $this->addEmployee(['computer'])->assertCreated();

        $request = ServiceRequest::firstOrFail();
        $approver = User::where('employee_id', $this->itManager->id)->firstOrFail();

        $payload = $this->actingAs($approver)->getJson("/api/service-requests/{$request->id}")->assertOk();

        $payload->assertJsonPath('data.origin', 'onboarding');
        $payload->assertJsonPath('data.submitted_by.name', $this->hrUser->name);
        $payload->assertJsonPath('data.requester.name', 'Somchai Jaidee');
    }

    public function test_a_request_waits_for_a_manager_without_an_account_instead_of_passing_itself(): void
    {
        // The new employee's manager has not been given a login yet — the case that
        // used to skip the whole chain and leave the request approved with nobody
        // having approved anything.
        User::where('employee_id', $this->itManager->id)->delete();

        $this->addEmployee(['computer'])->assertCreated();

        $request = ServiceRequest::firstOrFail();
        $this->assertSame(RequestStatus::Pending, $request->status);

        $current = $request->approvals()->where('status', ApprovalStatus::Current->value)->firstOrFail();
        $this->assertSame($this->itManager->id, $current->approver_employee_id);
    }

    public function test_the_api_says_the_step_is_waiting_on_an_account_and_stops_saying_it_once_created(): void
    {
        User::where('employee_id', $this->itManager->id)->delete();
        $this->addEmployee(['computer'])->assertCreated();
        $request = ServiceRequest::firstOrFail();
        $viewer = $this->makeUser('viewer', ['requests.view_all']);

        // The manager's own rung — the Supervisor rung above a Manager finds nobody,
        // so it is not the first row.
        $rungIndex = $this->managerRungIndex($request);

        $this->actingAs($viewer)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath("data.approvals.{$rungIndex}.awaiting_account", true);

        // Reported live, not snapshotted: provisioning the account clears it without
        // anything rewriting the frozen approval row.
        $this->makeUser('user', [], $this->itManager);

        $this->actingAs($viewer)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath("data.approvals.{$rungIndex}.awaiting_account", false);
    }

    public function test_that_manager_can_approve_as_soon_as_their_account_exists(): void
    {
        User::where('employee_id', $this->itManager->id)->delete();
        $this->addEmployee(['computer'])->assertCreated();
        $request = ServiceRequest::firstOrFail();

        // Account provisioned afterwards through the normal set-credentials flow.
        $managerUser = $this->makeUser('user', [], $this->itManager);

        $this->actingAs($managerUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->assertSame(
            ApprovalStatus::Approved,
            $request->approvals()->where('approver_employee_id', $this->itManager->id)->firstOrFail()->status,
        );
    }

    public function test_provisioning_the_account_delivers_the_approvals_that_were_waiting_for_it(): void
    {
        User::where('employee_id', $this->itManager->id)->delete();
        $this->addEmployee(['computer', 'email'])->assertCreated();

        // Filed while the approver had no account: the bells they should have received
        // went nowhere, and nothing replays on a poll — the request just sits there.
        $pending = ServiceRequest::count();
        $this->assertSame(2, $pending);

        $account = app(EmployeeService::class)
            ->createUserWithCredentials($this->itManager, 'itmgr', 'Str0ng!pass', true);

        // The moment there is an inbox, the missed "awaiting your decision" bells land in it.
        $bells = $account->notifications()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === 'waiting');
        $this->assertCount($pending, $bells);
        $this->assertEqualsCanonicalizing(
            ServiceRequest::all()->pluck('reference')->all(),
            $bells->pluck('data.reference')->all(),
        );
    }

    public function test_the_new_employee_can_read_the_requests_that_were_filed_for_them(): void
    {
        $this->addEmployee(['computer'])->assertCreated();
        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $request = ServiceRequest::firstOrFail();

        // Their own account, provisioned later. The request carries employee_id = them,
        // but user_id is null (they had none when HR filed it) — so "my requests" used to
        // miss it and the detail returned 403. Their own onboarding was invisible to them.
        $own = $this->makeUser('user', ['requests.submit'], $employee);

        $this->actingAs($own)->getJson('/api/service-requests')
            ->assertOk()
            ->assertJsonPath('data.0.reference', $request->reference);

        $this->actingAs($own)->getJson('/api/service-requests?scope=mine')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($own)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.submitted_by.name', $this->hrUser->name);
    }

    public function test_reading_it_does_not_mean_withdrawing_it(): void
    {
        $this->addEmployee(['computer'])->assertCreated();
        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $request = ServiceRequest::firstOrFail();
        $own = $this->makeUser('user', ['requests.submit'], $employee);

        // Onboarding belongs to whoever runs it: the new hire may follow their own
        // request, not cancel the laptop HR asked for on their first day.
        $this->actingAs($own)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.can_cancel', false);
        $this->actingAs($own)->postJson("/api/service-requests/{$request->id}/cancel")->assertForbidden();
    }

    public function test_provisioning_an_account_with_nothing_waiting_sends_nothing(): void
    {
        $employee = Employee::create(['first_name' => 'Quiet', 'position_id' => $this->staff->id]);

        $account = app(EmployeeService::class)
            ->createUserWithCredentials($employee, 'quiet', 'Str0ng!pass', true);

        $this->assertSame(0, $account->notifications()->count());
    }

    public function test_the_filer_gets_the_receipt_the_new_employee_cannot(): void
    {
        $this->addEmployee(['computer'])->assertCreated();

        // The request's owner has no login yet, so the submitted-receipt would fall on
        // the floor — it goes to the person who filed it instead.
        $this->assertSame(1, DatabaseNotification::where('notifiable_id', $this->hrUser->id)->count());
    }

    public function test_the_filer_can_still_open_and_cancel_what_they_filed(): void
    {
        // Seeing requests is a Request-module read, so HR needs that permission too.
        RolePermission::updateOrCreate(
            ['role_id' => Role::where('key', 'hr')->firstOrFail()->id, 'permission' => 'requests.submit'],
            ['allowed' => true],
        );

        $this->addEmployee(['computer'])->assertCreated();
        $request = ServiceRequest::firstOrFail();

        // Owned by an employee with no account, so without the provenance link the
        // request would be invisible to the only person who could withdraw it.
        $this->actingAs($this->hrUser)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()
            ->assertJsonPath('data.can_cancel', true);

        $this->actingAs($this->hrUser)->getJson('/api/service-requests?scope=mine')
            ->assertOk()
            ->assertJsonPath('data.0.reference', $request->reference);

        $this->actingAs($this->hrUser)->postJson("/api/service-requests/{$request->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }
}
