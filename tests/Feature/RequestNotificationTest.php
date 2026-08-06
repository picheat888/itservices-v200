<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\PositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PositionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        // Each person holds the rung the routes ask for — chain steps resolve by
        // position, so a line without titles reaches nobody.
        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $title('Manager')]);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $mgr->id, 'position_id' => $title('Supervisor')]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $title('Staff/Officer')]);

        $userRole = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $userRole->id, 'permission' => 'requests.submit'], ['allowed' => true]);
        $itRole = Role::firstOrCreate(['key' => 'it'], ['name' => 'IT', 'color' => '#0284c7', 'is_system' => false]);
        RolePermission::updateOrCreate(['role_id' => $itRole->id, 'permission' => 'requests.fulfill'], ['allowed' => true]);

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

    public function test_submit_notifies_the_first_approver_and_the_requester(): void
    {
        $request = $this->submitComputer();

        $this->assertCount(1, $this->bells($this->supUser, 'waiting'));
        $this->assertCount(1, $this->bells($this->requester, 'submitted'));
        $this->assertCount(0, $this->bells($this->mgrUser, 'waiting'));

        $bell = $this->bells($this->supUser, 'waiting')[0];
        $this->assertSame($request->reference, $bell->data['reference']);
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
        $request = $this->submitComputer();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->assertCount(1, $this->bells($this->requester, 'approved_final'));
        $this->assertCount(1, $this->bells($this->itUser, 'waiting'));

        $this->actingAs($this->itUser)->postJson("/api/service-requests/{$request->id}/fulfill")->assertOk();
        $this->assertCount(1, $this->bells($this->requester, 'fulfilled'));
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
