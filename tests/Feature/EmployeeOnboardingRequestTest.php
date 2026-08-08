<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\AppSetting;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Employee\EmployeeService;
use Database\Seeders\PositionSeeder;
use Database\Seeders\RequestOptionSeeder;
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
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        // Login accounts take their role from a Role Group; without a default one the
        // service refuses to provision rather than guessing. Two tests below create
        // accounts, so this install is set up the way an administrator would.
        $defaultGroup = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $defaultGroup->id);

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
     * The detail a day-one service asks for, as Step 3 would submit it. Kept here so the
     * tests below can name the services they care about and still send a payload that
     * satisfies the schema's required fields.
     *
     * @return array<string, mixed>
     */
    private function fieldsFor(string $service): array
    {
        $deviceId = fn (string $type) => (int) RequestOption::where('request_type', $type)
            ->where('field_key', 'device_id')->where('active', true)->value('id');

        return match ($service) {
            'computer' => ['device_id' => $deviceId('computer')],
            'mobile' => ['device_id' => $deviceId('mobile'), 'sim' => 'yes'],
            'email' => ['address' => 'somchai.jaidee@inaba.co.th'],
            default => [],
        };
    }

    /**
     * Adds an employee the way the Add Employee dialog does, with the onboarding
     * services ticked.
     *
     * @param  list<string>  $services
     * @param  array<string, array<string, mixed>>  $fields  override what a service submits
     */
    private function addEmployee(array $services, ?string $note = null, array $fields = []): TestResponse
    {
        $submitted = [];
        foreach ($services as $service) {
            $submitted[$service] = $fields[$service] ?? $this->fieldsFor($service);
        }

        return $this->actingAs($this->hrUser)->postJson('/api/employees', [
            'first_name' => 'Somchai',
            'last_name' => 'Jaidee',
            'department_id' => $this->it->id,
            'section_id' => $this->support->id,
            'position_id' => $this->staff->id,
            'manager_id' => $this->itManager->id,
            'joined_at' => '2026-09-01',
            'services' => $submitted,
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

    /** Asks the precheck the way Step 3 does: about a hire who does not exist yet. */
    private function precheck(?Employee $manager = null, ?Position $position = null): TestResponse
    {
        return $this->actingAs($this->hrUser)->getJson('/api/employees/onboarding-precheck?'.http_build_query([
            'manager_id' => ($manager ?? $this->itManager)->id,
            'position_id' => ($position ?? $this->staff)->id,
        ]));
    }

    public function test_the_precheck_clears_a_line_that_can_carry_the_requests(): void
    {
        $this->precheck()->assertOk()
            ->assertJsonPath('can_request', true)
            ->assertJsonPath('reason', null)
            ->assertJsonPath('blocked_services', []);
    }

    public function test_the_precheck_answers_without_creating_anybody(): void
    {
        $before = Employee::count();

        $this->precheck()->assertOk();

        // The whole point: the answer is available before Save, so nothing may be written.
        $this->assertSame($before, Employee::count());
    }

    public function test_the_precheck_blocks_when_every_manager_above_them_has_left(): void
    {
        $this->itManager->update(['status' => EmployeeStatus::Resigned]);
        $this->director->update(['status' => EmployeeStatus::Resigned]);

        $response = $this->precheck()->assertOk()
            ->assertJsonPath('can_request', false)
            ->assertJsonPath('reason', 'chain_approver_resigned');

        // Named, because "somebody in the line resigned" is useless without knowing who.
        $this->assertEqualsCanonicalizing(
            [$this->itManager->name, $this->director->name],
            $response->json('resigned_in_chain.*.name'),
        );
    }

    public function test_the_precheck_blocks_when_a_rung_would_have_landed_on_somebody_who_left(): void
    {
        // The line still has an active person at the top — but the Manager rung the
        // Computer route asks for belongs to the one who left, and handing it upward
        // would record a decision they never made.
        $this->itManager->update(['status' => EmployeeStatus::Resigned]);

        $this->precheck()->assertOk()
            ->assertJsonPath('can_request', false)
            ->assertJsonPath('reason', 'chain_approver_resigned')
            ->assertJsonPath('resigned_in_chain.0.name', $this->itManager->name);
    }

    public function test_the_precheck_reports_a_closed_workflow_as_its_own_reason(): void
    {
        Workflow::query()->update(['active' => false]);

        $this->precheck()->assertOk()
            ->assertJsonPath('can_request', false)
            // A different person fixes this one, so it must not read as a resigned approver.
            ->assertJsonPath('reason', 'workflow_inactive');
    }

    public function test_a_broken_chain_still_reads_as_the_chain_when_a_workflow_is_also_closed(): void
    {
        Workflow::where('request_type', 'computer')->update(['active' => false]);
        $this->itManager->update(['status' => EmployeeStatus::Resigned]);
        $this->director->update(['status' => EmployeeStatus::Resigned]);

        // Both are true; the banner names the one the person filling the form can act on.
        $this->precheck()->assertOk()->assertJsonPath('reason', 'chain_approver_resigned');
    }

    public function test_the_precheck_needs_the_permission_to_add_an_employee(): void
    {
        $outsider = $this->makeUser('nosy', ['employees.view']);

        $this->actingAs($outsider)->getJson('/api/employees/onboarding-precheck')->assertForbidden();
    }

    public function test_the_precheck_and_the_save_agree_on_a_broken_line(): void
    {
        $this->itManager->update(['status' => EmployeeStatus::Resigned]);
        $this->director->update(['status' => EmployeeStatus::Resigned]);

        $this->precheck()->assertJsonPath('can_request', false);

        // The preview would be worse than nothing if Save disagreed with it.
        $response = $this->addEmployee(['computer'])->assertCreated();
        $this->assertSame(['computer'], $response->json('onboarding.failed.*.service'));
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_each_ticked_service_becomes_its_own_request(): void
    {
        $this->addEmployee(['computer', 'email'])->assertCreated();

        $this->assertSame(2, ServiceRequest::count());
        $this->assertEqualsCanonicalizing(['computer', 'email'], $this->filedTypes());
    }

    public function test_the_detail_step_3_collected_lands_on_the_request(): void
    {
        $laptop = RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->firstOrFail();

        $this->addEmployee(['computer'], null, ['computer' => ['device_id' => $laptop->id]])->assertCreated();

        // Stored as a foreign key, not a copy of the label, so renaming the option later
        // does not rewrite history — same as a request typed into the Request form.
        $request = ServiceRequest::firstOrFail();
        $this->assertSame($laptop->id, $request->request_option_id);
    }

    public function test_an_approver_sees_which_kind_of_machine_was_asked_for(): void
    {
        $laptop = RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->firstOrFail();
        $this->addEmployee(['computer'], null, ['computer' => ['device_id' => $laptop->id]])->assertCreated();

        $request = ServiceRequest::firstOrFail();
        $approver = User::where('employee_id', $this->itManager->id)->firstOrFail();

        // The point of collecting it: the person deciding can read it without asking.
        // fields_display is the point-in-time snapshot the detail view renders, so the
        // label is the one that was chosen even if the option is renamed later.
        $payload = $this->actingAs($approver)->getJson("/api/service-requests/{$request->id}")->assertOk();
        $this->assertStringContainsString('Laptop', json_encode($payload->json('data.fields_display')));
    }

    public function test_a_service_ticked_without_its_required_detail_is_refused(): void
    {
        // The hole this closes: submitFor() never passed through StoreServiceRequestRequest,
        // so onboarding used to file a computer request carrying no device type at all.
        $this->addEmployee(['computer'], null, ['computer' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors('services.computer.device_id');

        // Refused before anything is written — not a half-made employee.
        $this->assertSame(0, Employee::where('first_name', 'Somchai')->count());
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_an_option_borrowed_from_another_service_is_refused(): void
    {
        $tablet = RequestOption::where('request_type', 'mobile')->where('label_en', 'Tablet')->firstOrFail();

        // Every managed choice is scoped to its own field, so a mobile id cannot answer
        // a computer request even though both fields are called device_id.
        $this->addEmployee(['computer'], null, ['computer' => ['device_id' => $tablet->id]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('services.computer.device_id');
    }

    public function test_a_service_that_is_not_a_day_one_service_is_refused(): void
    {
        $this->actingAs($this->hrUser)->postJson('/api/employees', [
            'first_name' => 'Somchai',
            'last_name' => 'Jaidee',
            'position_id' => $this->staff->id,
            'manager_id' => $this->itManager->id,
            'services' => ['software' => ['software_id' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('services');
    }

    public function test_the_form_is_told_what_each_service_asks_for(): void
    {
        $payload = $this->actingAs($this->hrUser)->getJson('/api/employees/onboarding-services')->assertOk();

        $this->assertSame(['computer', 'mobile', 'email'], array_column($payload->json('data'), 'service'));

        // Read from RequestSchemas, so a device type IT adds under Settings → Request
        // data reaches Step 3 without a deploy — the reason those are rows at all.
        $computer = collect($payload->json('data'))->firstWhere('service', 'computer');
        $this->assertSame('device_id', $computer['fields'][0]['key']);
        $this->assertTrue($computer['fields'][0]['required']);
        $this->assertEqualsCanonicalizing(
            ['Laptop', 'Desktop PC'],
            array_column($computer['fields'][0]['options'], 'label_en'),
        );

        // A mobile asks two things and both have to be answered — a blank SIM line sends
        // IT back to the requester, which is what asking at all was meant to avoid.
        $mobile = collect($payload->json('data'))->firstWhere('service', 'mobile');
        $this->assertSame(['device_id', 'sim'], array_column($mobile['fields'], 'key'));
        $this->assertSame([true, true], array_column($mobile['fields'], 'required'));
    }

    public function test_a_mobile_without_its_sim_answer_is_refused(): void
    {
        $phone = RequestOption::where('request_type', 'mobile')->where('label_en', 'Smartphone')->firstOrFail();

        $this->addEmployee(['mobile'], null, ['mobile' => ['device_id' => $phone->id]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('services.mobile.sim');

        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_reading_what_the_services_ask_for_needs_the_permission_to_add(): void
    {
        // Gated by employees.add, not requests.submit: revoking a Request-module
        // permission must not break a form that never opens the Request module.
        $outsider = $this->makeUser('nosy', ['employees.view', 'requests.submit']);

        $this->actingAs($outsider)->getJson('/api/employees/onboarding-services')->assertForbidden();
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

    public function test_the_note_is_appended_to_the_generated_reason_not_swapped_for_it(): void
    {
        $this->addEmployee(['computer'], 'Needs a laptop with 32GB for the QA suite.')->assertCreated();

        $reason = ServiceRequest::firstOrFail()->reason;

        // Behind `**` on its own line, so an approver can see which half a person wrote.
        $this->assertStringEndsWith("\n**Needs a laptop with 32GB for the QA suite.", $reason);
        // The generated half survives: writing a note used to replace this text, which
        // silently deleted the first day — the one fact an approver needs and nobody retypes.
        $this->assertStringContainsString('first day 2026-09-01', $reason);
    }

    public function test_no_note_leaves_the_generated_reason_alone(): void
    {
        $this->addEmployee(['computer'])->assertCreated();

        // Two lines, the first day on its own — the fact an approver acts on.
        $this->assertSame(
            "Onboarding request with the new employee,\nfirst day 2026-09-01.",
            ServiceRequest::firstOrFail()->reason,
        );
    }

    public function test_the_api_refuses_a_hire_with_no_start_date(): void
    {
        // The form has always demanded one; the API used to accept it anyway, which left
        // the onboarding reason with no first day — the one fact telling an approver how
        // urgent this is.
        $this->actingAs($this->hrUser)->postJson('/api/employees', [
            'first_name' => 'Nodate',
            'last_name' => 'Hire',
            'department_id' => $this->it->id,
            'section_id' => $this->support->id,
            'position_id' => $this->staff->id,
            'manager_id' => $this->itManager->id,
            'services' => ['computer' => $this->fieldsFor('computer')],
        ])->assertStatus(422)->assertJsonValidationErrors('joined_at');

        $this->assertSame(0, ServiceRequest::count());
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

    public function test_both_the_new_employee_and_the_filer_hear_how_it_ended(): void
    {
        $this->addEmployee(['computer'])->assertCreated();
        $employee = Employee::where('first_name', 'Somchai')->firstOrFail();
        $request = ServiceRequest::firstOrFail();
        // Their account arrives after the request was filed, as it always does.
        $own = $this->makeUser('user', [], $employee);

        $manager = User::where('employee_id', $this->itManager->id)->firstOrFail();
        $this->actingAs($manager)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        // The person it is for now has somewhere to be told, and the person who filed it
        // still needs to know — onboarding is their errand to finish.
        foreach ([$own, $this->hrUser] as $follower) {
            $bells = $follower->notifications()->get()
                ->filter(fn ($n) => ($n->data['subtype'] ?? null) === 'approved_final');
            $this->assertCount(1, $bells, "no final-approval bell for user {$follower->id}");
        }
    }

    public function test_a_request_somebody_filed_for_themselves_is_announced_once(): void
    {
        RolePermission::updateOrCreate(
            ['role_id' => Role::where('key', 'hr')->firstOrFail()->id, 'permission' => 'requests.submit'],
            ['allowed' => true],
        );

        $response = $this->actingAs($this->hrUser)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'A laptop for me',
            'reason' => 'Mine broke.',
            'fields' => [
                'device_id' => (int) RequestOption::where('request_type', 'computer')
                    ->where('label_en', 'Laptop')->value('id'),
                'qty' => 1,
            ],
        ])->assertCreated();

        // Owner and filer are the same account here: one receipt, not two.
        $bells = $this->hrUser->notifications()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === 'submitted');
        $this->assertCount(1, $bells);
        $this->assertSame($response->json('data.reference'), $bells->first()->data['reference']);
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
