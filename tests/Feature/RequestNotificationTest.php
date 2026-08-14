<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Models\Workflow\Workflow;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\PositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\TestCase;

/**
 * Bell fan-out per workflow transition (drawio: every hop notifies Bell +
 * Email): first approver on submit, next approver after a step, requester on
 * reject with the remark, and the fulfill queue after the final approval.
 */
class RequestNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;

    private User $supUser;

    private User $mgrUser;

    private User $itUser;

    private Employee $sup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        // Each person holds the rung the routes ask for — chain steps resolve by
        // position, so a line without titles reaches nobody.
        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $title('Manager')]);
        $sup = $this->sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $mgr->id, 'position_id' => $title('Supervisor')]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $title('Staff/Officer')]);

        $userRole = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $userRole->id, 'permission' => 'requests.submit'], ['allowed' => true]);
        $itRole = Role::firstOrCreate(['key' => 'it'], ['name' => 'IT', 'color' => '#0284c7', 'is_system' => false]);
        // Closing requests and hearing about them are separate permissions: the queue bell
        // follows notify_approved, so an IT user needs both to appear in these tests.
        foreach (['requests.fulfill', 'requests.notify_approved'] as $permission) {
            RolePermission::updateOrCreate(['role_id' => $itRole->id, 'permission' => $permission], ['allowed' => true]);
        }

        $this->requester = User::factory()->create(['role' => 'user', 'employee_id' => $staff->id]);
        $this->supUser = User::factory()->create(['role' => 'user', 'employee_id' => $sup->id]);
        $this->mgrUser = User::factory()->create(['role' => 'user', 'employee_id' => $mgr->id]);
        $this->itUser = User::factory()->create(['role' => 'it']);
    }

    /** Bell payloads of one user for a given subtype. */
    private function bells(User $user, string $subtype): array
    {
        return $user->notifications()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === $subtype)
            ->values()->all();
    }

    /**
     * The seeded "Laptop" choice. The computer form's device list is managed data
     * (Settings → Request data), so the payload carries an option id.
     */
    private function deviceOptionId(): int
    {
        return (int) RequestOption::where('request_type', 'computer')
            ->where('label_en', 'Laptop')->value('id');
    }

    private function submitComputer(): ServiceRequest
    {
        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $this->deviceOptionId(), 'qty' => 1],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_submit_notifies_the_first_approver_and_the_requester(): void
    {
        $request = $this->submitComputer();

        $this->assertCount(1, $this->bells($this->supUser, 'waiting'));
        $this->assertCount(1, $this->bells($this->requester, 'submitted'));
        $this->assertCount(0, $this->bells($this->mgrUser, 'waiting'));

        $bell = $this->bells($this->supUser, 'waiting')[0];
        $this->assertSame($request->reference, $bell->data['reference']);
    }

    public function test_a_request_stuck_on_an_approver_without_an_account_tells_whoever_can_create_one(): void
    {
        // The Supervisor rung resolves to a real person who cannot sign in yet: nobody
        // involved can move the request, and the approver has no inbox to be told.
        $this->supUser->delete();
        $accountAdmin = $this->makeUserWith('employees.set_credentials');

        $request = $this->submitComputer();

        $bells = $this->bells($accountAdmin, 'blocked_no_account');
        $this->assertCount(1, $bells);
        $this->assertSame($request->reference, $bells[0]->data['reference']);
        // Carries the person to provision, so the bell can open them rather than the
        // request nobody can act on.
        $this->assertSame($this->sup->id, $bells[0]->data['employee_id']);
        $this->assertSame('Sup', $bells[0]->data['actor_name']);

        // The approver themselves gets nothing — there is nowhere to send it.
        $this->assertSame(0, DatabaseNotification::where('notifiable_id', $this->supUser->id)->count());
    }

    public function test_the_it_queue_row_does_not_raise_a_blocked_bell(): void
    {
        $accountAdmin = $this->makeUserWith('employees.set_credentials');

        $request = $this->submitComputer();
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        // The fulfillment row names no person at all: it is a queue, not somebody
        // waiting for an account.
        $this->assertCount(0, $this->bells($accountAdmin, 'blocked_no_account'));
    }

    /** A user whose role grants exactly the given permission. */
    private function makeUserWith(string $permission): User
    {
        $role = Role::firstOrCreate(['key' => 'acct'], ['name' => 'Account admin', 'color' => '#000', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);

        return User::factory()->create(['role' => 'acct']);
    }

    public function test_each_step_hands_the_bell_to_the_next_approver(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->assertCount(1, $this->bells($this->mgrUser, 'waiting'));
        $this->assertCount(1, $this->bells($this->requester, 'approved_step'));
    }

    public function test_final_approval_notifies_requester_and_the_fulfill_queue(): void
    {
        // No auto-ticket: this test follows the bells of the manual queue, and a request
        // that opened a case is fulfilled by closing that case instead (the bells of that
        // path are RequestAutoTicketTest's).
        Workflow::where('request_type', 'computer')->firstOrFail()->update(['auto_ticket' => false]);
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->assertCount(1, $this->bells($this->requester, 'approved_final'));

        // The queue hears its own subtype, never the approvers' one: this bell asks for a
        // delivery, not a decision. No case was opened here, so it carries no ticket and
        // the SPA renders the "waiting for IT to deliver" copy.
        $bells = $this->bells($this->itUser, 'ready_to_fulfill');
        $this->assertCount(1, $bells);
        $this->assertNull($bells[0]->data['ticket_no']);
        $this->assertCount(0, $this->bells($this->itUser, 'waiting'));

        $this->actingAs($this->itUser)->postJson("/api/service-requests/{$request->id}/fulfill")->assertOk();
        $this->assertCount(1, $this->bells($this->requester, 'fulfilled'));
    }

    /**
     * A workflow that opens its own case leaves IT nothing to decide and nothing to press:
     * closing the case is what fulfils the request. The bell has to say that, or it reads
     * as a second approval step sitting next to the case's own "new case" bell.
     */
    public function test_the_queue_bell_names_the_case_when_one_was_opened(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $ticket = $request->fresh()->ticket;
        $this->assertNotNull($ticket, 'the computer workflow is the auto_ticket one');

        $bells = $this->bells($this->itUser, 'ready_to_fulfill');
        $this->assertCount(1, $bells);
        $this->assertSame($ticket->ticket_no, $bells[0]->data['ticket_no']);
        $this->assertSame($ticket->id, $bells[0]->data['ticket_id']);
        $this->assertCount(0, $this->bells($this->itUser, 'waiting'));
    }

    public function test_reject_returns_the_remark_to_the_requester(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)
            ->postJson("/api/service-requests/{$request->id}/reject", ['note' => 'Not in this budget cycle'])
            ->assertOk();

        $bells = $this->bells($this->requester, 'rejected');
        $this->assertCount(1, $bells);
        $this->assertSame('Not in this budget cycle', $bells[0]->data['remark']);
    }

    public function test_request_email_templates_are_seeded(): void
    {
        $this->seed(EmailTemplateSeeder::class);

        foreach (['request.submitted', 'request.ready_to_fulfill', 'request.fulfilled', 'request.approval_needed'] as $key) {
            $this->assertTrue(EmailTemplate::where('key', $key)->exists(), "missing template {$key}");
        }
    }
}
