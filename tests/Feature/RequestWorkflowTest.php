<?php

namespace Tests\Feature;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Sidebar\SidebarBadgeService;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The service-request lifecycle over HTTP: submit → step-by-step approval →
 * fulfillment, with every guard (identity, state, remark) and the snapshot
 * property that workflow edits never touch in-flight requests.
 */
class RequestWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Employee $mgr;

    private Employee $sup;

    private Employee $staff;

    private User $requester;

    private User $supUser;

    private User $mgrUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(WorkflowSeeder::class);

        // staff → sup → mgr reporting line, everyone with a login.
        $this->mgr = Employee::create(['first_name' => 'Mgr']);
        $this->sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $this->mgr->id]);
        $this->staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $this->sup->id]);

        $this->requester = $this->makeUser('user', ['requests.submit'], $this->staff);
        $this->supUser = $this->makeUser('user', [], $this->sup);
        $this->mgrUser = $this->makeUser('user', [], $this->mgr);
    }

    /** A user on the given role key, with the role granted the listed permissions. */
    private function makeUser(string $roleKey, array $permissions = [], ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(
            ['key' => $roleKey],
            ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false],
        );
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $p], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    /** Submit a computer request (Sup → Mgr chain + IT fulfillment) and return it. */
    private function submitComputer(): ServiceRequest
    {
        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'priority' => 'medium',
            'fields' => ['device' => 'laptop', 'qty' => 1],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_submit_creates_request_with_rq_reference_and_frozen_chain(): void
    {
        $request = $this->submitComputer();

        $this->assertSame('RQ-'.now()->year.'-0001', $request->reference);
        $this->assertSame(RequestStatus::Pending, $request->status);
        $this->assertTrue($request->auto_ticket);
        $this->assertSame('Staff', $request->requester_name);

        $approvals = $request->approvals;
        $this->assertCount(3, $approvals); // Sup, Mgr, IT queue
        $this->assertSame(ApprovalStatus::Current, $approvals[0]->status);
        $this->assertSame($this->sup->id, $approvals[0]->approver_employee_id);
        // The clock the module measures afterwards starts here; there is no deadline.
        $this->assertNotNull($approvals[0]->became_current_at);
        $this->assertSame(ApprovalStatus::Waiting, $approvals[1]->status);
    }

    public function test_submit_requires_permission_and_an_employee_link(): void
    {
        $noPermission = $this->makeUser('blank', [], Employee::create(['first_name' => 'Blank']));
        $this->actingAs($noPermission)->postJson('/api/service-requests', ['type' => 'computer'])
            ->assertForbidden();

        $noEmployee = $this->makeUser('user', [], null);
        $this->actingAs($noEmployee)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'priority' => 'medium',
            'fields' => ['device' => 'laptop'],
        ])->assertUnprocessable()->assertJsonValidationErrors('requester');
    }

    public function test_submit_blocked_when_workflow_inactive_and_validates_type_fields(): void
    {
        Workflow::where('request_type', 'computer')->firstOrFail()->update(['active' => false]);
        $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'priority' => 'medium',
            'fields' => ['device' => 'laptop'],
        ])->assertUnprocessable()->assertJsonValidationErrors('type');

        // Missing the required device select for the computer schema.
        Workflow::where('request_type', 'computer')->firstOrFail()->update(['active' => true]);
        $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'priority' => 'medium',
            'fields' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors('fields.device');
    }

    /**
     * The requested mailbox is the whole point of an email request, so a
     * malformed address is refused rather than routed to approvers.
     */
    public function test_an_email_request_checks_the_address_format(): void
    {
        $base = [
            'type' => 'email',
            'title' => 'Mailbox for the new QA hire',
            'reason' => 'They start on Monday and need a company address.',
        ];

        $this->actingAs($this->requester)
            ->postJson('/api/service-requests', $base + ['fields' => ['address' => 'not-an-address']])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.address');

        $this->actingAs($this->requester)
            ->postJson('/api/service-requests', $base + ['fields' => ['address' => 'qa.hire@inaba.co.th']])
            ->assertCreated();
    }

    /** Software is picked from the Access Directory catalogue OR typed in — exactly one. */
    public function test_software_accepts_either_the_catalogue_or_a_typed_name(): void
    {
        $base = [
            'type' => 'software',
            'title' => 'Request: Software install',
            'reason' => 'Needed to open the vendor drawings shared with us.',
        ];

        // Neither side filled — both keys report the missing pair.
        $this->actingAs($this->requester)->postJson('/api/service-requests', $base + ['fields' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['fields.software_id', 'fields.software_other']);

        // A typed-in name is enough on its own.
        $this->actingAs($this->requester)
            ->postJson('/api/service-requests', $base + ['fields' => ['software_other' => 'AutoCAD LT 2026']])
            ->assertCreated();

        // So is a catalogue pick.
        $software = Software::create(['code' => 'SW-T1', 'name' => 'Acrobat Pro']);
        $this->actingAs($this->requester)
            ->postJson('/api/service-requests', $base + ['fields' => ['software_id' => $software->id]])
            ->assertCreated();
    }

    /** Access Directory grants Read or Read/Write only — "full control" is not a choice. */
    public function test_file_share_access_level_offers_no_full_control(): void
    {
        $share = FileShare::create(['code' => 'FS-T9', 'name' => 'QA', 'path' => '\\\\FILES\\QA']);
        $payload = [
            'type' => 'fileshare',
            'title' => 'Request: File share access',
            'reason' => 'Read the QC recipes for the new production line.',
            'fields' => ['file_share_id' => $share->id, 'access_level' => 'full'],
        ];

        $this->actingAs($this->requester)->postJson('/api/service-requests', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('fields.access_level');

        $payload['fields']['access_level'] = 'write';
        $this->actingAs($this->requester)->postJson('/api/service-requests', $payload)->assertCreated();
    }

    public function test_only_the_resolved_current_approver_may_decide(): void
    {
        $request = $this->submitComputer();

        // The requester, the NEXT approver, and even a super admin all get 403.
        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();
        $super = User::factory()->create(['role' => 'super']);
        $this->actingAs($super)->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();

        // The resolved approver of the current step passes.
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
    }

    public function test_approve_advances_and_final_approval_flips_the_request(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", ['note' => 'ok'])->assertOk();

        $request->refresh();
        $this->assertSame(RequestStatus::Pending, $request->status);
        $this->assertSame($this->mgr->id, $request->currentApproval()->approver_employee_id);

        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $request->refresh();
        $this->assertSame(RequestStatus::Approved, $request->status);
        $this->assertNotNull($request->approved_at);
        // The fulfillment queue row is now the current step.
        $this->assertSame('it_staff', $request->currentApproval()->actor_type->value);
    }

    public function test_reject_requires_a_note_and_finalizes_the_request(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/reject")
            ->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->actingAs($this->supUser)
            ->postJson("/api/service-requests/{$request->id}/reject", ['note' => 'Budget frozen this quarter'])
            ->assertOk();

        $request->refresh();
        $this->assertSame(RequestStatus::Rejected, $request->status);
        $rejectedRow = $request->approvals->firstWhere('status', ApprovalStatus::Rejected);
        $this->assertSame('Budget frozen this quarter', $rejectedRow->note);
        // Later steps were never reached.
        $this->assertSame(ApprovalStatus::Waiting, $request->approvals->firstWhere('approver_employee_id', $this->mgr->id)->status);
    }

    public function test_double_decisions_are_blocked(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        // Sup already decided; it is Mgr's turn now.
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertForbidden();

        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        // Fully approved: no further decision is possible for anyone.
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertUnprocessable();
    }

    public function test_fulfill_requires_permission_and_approved_status(): void
    {
        $request = $this->submitComputer();
        $it = $this->makeUser('it', ['requests.fulfill']);

        $this->actingAs($it)->postJson("/api/service-requests/{$request->id}/fulfill")->assertUnprocessable();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve");
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve");

        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/fulfill")->assertForbidden();
        $this->actingAs($it)->postJson("/api/service-requests/{$request->id}/fulfill")->assertOk();

        $this->assertSame(RequestStatus::Fulfilled, $request->fresh()->status);
    }

    public function test_cancel_only_by_the_requester_while_pending(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/cancel")->assertForbidden();
        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/cancel")->assertOk();
        $this->assertSame(RequestStatus::Cancelled, $request->fresh()->status);

        // Nothing further can happen to a cancelled request.
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertUnprocessable();
    }

    public function test_editing_the_workflow_never_touches_an_inflight_request(): void
    {
        $request = $this->submitComputer();
        $before = $request->approvals->pluck('approver_employee_id', 'position')->all();

        // Admin rewrites the computer workflow to a single fulfillment-less step.
        $admin = $this->makeUser('wfadmin', ['workflows.manage']);
        $workflow = Workflow::where('request_type', 'computer')->firstOrFail();
        $this->actingAs($admin)->putJson("/api/workflows/{$workflow->id}", [
            'auto_ticket' => false,
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Only Boss', 'kind' => 'approval'],
            ],
        ])->assertOk();

        // The in-flight request still runs on its frozen chain — and stays approvable.
        $this->assertSame($before, $request->fresh()->approvals->pluck('approver_employee_id', 'position')->all());
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
    }

    public function test_index_scopes_visibility_and_reports_meta(): void
    {
        $this->submitComputer();

        // Requester sees their own request.
        $this->actingAs($this->requester)->getJson('/api/service-requests')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('meta.pending', 1);

        // An unrelated submitter sees nothing.
        $stranger = $this->makeUser('user', [], Employee::create(['first_name' => 'Stranger']));
        $this->actingAs($stranger)->getJson('/api/service-requests')->assertJsonPath('meta.total', 0);

        // The current approver sees it, and the approvals scope + meta point at them.
        $this->actingAs($this->supUser)->getJson('/api/service-requests?scope=approvals')
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('meta.awaiting_me', 1)
            ->assertJsonPath('data.0.can_approve', true);

        // view_all holders see everything.
        $auditor = $this->makeUser('auditor', ['requests.view_all']);
        $this->actingAs($auditor)->getJson('/api/service-requests')->assertJsonPath('meta.total', 1);

        // The sidebar badge counts the approval waiting on Sup.
        $this->assertSame(1, app(SidebarBadgeService::class)->forUser($this->supUser->fresh())['requests']);

        // Options endpoint: gated by requests.submit, lists all ten services.
        $this->actingAs($auditor)->getJson('/api/service-requests/options')->assertForbidden();
        $this->actingAs($this->requester)->getJson('/api/service-requests/options')
            ->assertOk()->assertJsonCount(11, 'data.types');
    }
}
