<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalStatus;
use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Services\Report\Request\ApprovalFacts;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\DecidesRequests;
use Tests\Concerns\GrantsRequestFiling;
use Tests\TestCase;

/**
 * A step nobody is left to approve (REQ-1): holders of requests.notify_blocked hear on arrival and each morning,
 * leavers hear nothing, and the detail and the approvals report say why the step is stuck.
 */
class RequestBlockedApproverTest extends TestCase
{
    use DecidesRequests;
    use GrantsRequestFiling;
    use RefreshDatabase;

    private User $requester;

    private User $supUser;

    private User $itLead;

    private Employee $sup;

    private Employee $mgr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);
        $this->seed(EmailTemplateSeeder::class);

        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $this->mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $title('Manager')]);
        $this->sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $this->mgr->id, 'position_id' => $title('Supervisor')]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $this->sup->id, 'position_id' => $title('Staff/Officer')]);

        $userRole = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff']);
        foreach (self::requestFiler() as $permission) {
            RolePermission::updateOrCreate(['role_id' => $userRole->id, 'permission' => $permission], ['allowed' => true]);
        }
        $leadRole = Role::firstOrCreate(['key' => 'lead'], ['name' => 'IT lead']);
        RolePermission::updateOrCreate(['role_id' => $leadRole->id, 'permission' => 'requests.notify_blocked'], ['allowed' => true]);

        $this->requester = User::factory()->create(['role' => 'user', 'employee_id' => $staff->id]);
        $this->supUser = User::factory()->create(['role' => 'user', 'employee_id' => $this->sup->id, 'email' => 'sup@example.com']);
        $this->itLead = User::factory()->create(['role' => 'lead']);
    }

    private function submitComputer(): ServiceRequest
    {
        $deviceId = (int) RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->value('id');

        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $deviceId, 'qty' => 1],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    private function resign(Employee $employee): void
    {
        $employee->forceFill(['status' => EmployeeStatus::Resigned, 'last_day' => null])->save();
    }

    /** The Manager rung, turned into a step open to the named people. */
    private function managerRungAsGroup(ServiceRequest $request, array $employeeIds): RequestApproval
    {
        $row = $request->approvals()->where('position', 2)->firstOrFail();
        $row->forceFill(['approver_employee_id' => null, 'approver_employee_ids' => $employeeIds])->saveQuietly();

        return $row;
    }

    private function currentRung(ServiceRequest $request): RequestApproval
    {
        return $request->approvals()->where('status', ApprovalStatus::Current->value)->firstOrFail();
    }

    /** Bells of one user carrying the given subtype. */
    private function bells(User $user, string $subtype): array
    {
        return $user->notifications()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === $subtype)
            ->values()->all();
    }

    private function approvalRow(ServiceRequest $request, int $position): array
    {
        $approvals = $this->actingAs($this->requester)->getJson("/api/service-requests/{$request->id}")->assertOk()->json('data.approvals');

        return collect($approvals)->firstWhere('position', $position);
    }

    public function test_a_step_whose_approver_has_left_bells_it_leads_when_the_request_reaches_it(): void
    {
        $request = $this->submitComputer();
        $mgrUser = User::factory()->create(['role' => 'user', 'employee_id' => $this->mgr->id]);
        $this->resign($this->mgr);

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", $this->decision($request))->assertOk();

        $bells = $this->bells($this->itLead, 'blocked_no_approver');
        $this->assertCount(1, $bells);
        $this->assertSame($request->reference, $bells[0]->data['reference']);
        $this->assertSame($this->currentRung($request)->label, $bells[0]->data['step_label']);
        // The leaver's account is never asked to decide
        $this->assertCount(0, $this->bells($mgrUser, 'waiting'));
    }

    public function test_a_group_step_everyone_has_left_bells_it_leads_when_the_request_reaches_it(): void
    {
        $request = $this->submitComputer();
        $this->managerRungAsGroup($request, [$this->mgr->id]);
        $this->resign($this->mgr);

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", $this->decision($request))->assertOk();

        $this->assertCount(1, $this->bells($this->itLead, 'blocked_no_approver'));
    }

    /** A group nobody resigned from, but that matches nobody besides the requester, is vacant, not "left". */
    public function test_a_group_step_that_matches_nobody_else_is_vacant(): void
    {
        $request = $this->submitComputer();
        $this->managerRungAsGroup($request, [$this->requester->employee_id]);

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", $this->decision($request))->assertOk();

        $this->assertCount(1, $this->bells($this->itLead, 'blocked_no_approver'));
        $this->assertSame('vacant', $this->approvalRow($request, 2)['blocked']);
        // The approvals report has no group for it yet; it is not counted as a resignation
        $steps = ApprovalFacts::waitingSteps([], now()->subMonth(), now());
        $this->assertNull(ApprovalFacts::blockedBecause($steps->first()));
    }

    public function test_a_group_step_with_somebody_left_to_sign_is_not_blocked(): void
    {
        $other = Employee::create(['first_name' => 'Deputy']);
        $deputy = User::factory()->create(['role' => 'user', 'employee_id' => $other->id]);
        $request = $this->submitComputer();
        $this->managerRungAsGroup($request, [$this->mgr->id, $other->id]);
        $this->resign($this->mgr);

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", $this->decision($request))->assertOk();

        $this->assertCount(0, $this->bells($this->itLead, 'blocked_no_approver'));
        $this->assertCount(1, $this->bells($deputy, 'waiting'));
        $this->assertNull($this->approvalRow($request, 2)['blocked']);
    }

    public function test_the_morning_reminder_goes_to_it_leads_instead_of_the_leaver(): void
    {
        $request = $this->submitComputer();
        $this->resign($this->sup);
        $this->currentRung($request)->forceFill(['became_current_at' => now()->subDays(4)])->saveQuietly();

        $this->artisan('requests:send-stalled-reminders')
            ->expectsOutputToContain('approver left: 1')
            ->assertSuccessful();

        $this->assertCount(1, $this->bells($this->itLead, 'blocked_no_approver'));
        $this->assertCount(0, $this->bells($this->supUser, 'stalled'));
    }

    public function test_the_morning_reminder_waits_three_days_like_every_other_reminder(): void
    {
        $request = $this->submitComputer();
        $this->resign($this->sup);
        $this->currentRung($request)->forceFill(['became_current_at' => now()->subDays(2)])->saveQuietly();

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        $this->assertCount(0, $this->bells($this->itLead, 'blocked_no_approver'));
    }

    public function test_the_reminder_resends_rather_than_piling_up(): void
    {
        $request = $this->submitComputer();
        $this->resign($this->sup);
        $this->currentRung($request)->forceFill(['became_current_at' => now()->subDays(4)])->saveQuietly();

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();
        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        $this->assertCount(1, $this->bells($this->itLead, 'blocked_no_approver'));
    }

    public function test_the_weekly_digest_skips_an_approver_who_has_left(): void
    {
        Queue::fake();
        RolePermission::updateOrCreate(['role_id' => $this->supUser->role_id, 'permission' => 'requests.notify_stalled'], ['allowed' => true]);
        $request = $this->submitComputer();
        $this->resign($this->sup);
        $this->currentRung($request)->forceFill(['became_current_at' => now()->subDays(10)])->saveQuietly();

        $this->artisan('requests:send-stalled-digest')
            ->expectsOutputToContain('recipients: 0, requests listed: 0')
            ->assertSuccessful();

        $this->assertCount(0, Queue::pushed(SendTemplatedEmail::class)->filter(fn (SendTemplatedEmail $job) => $job->templateKey === 'request.stalled_digest'));
    }

    public function test_the_detail_says_why_each_kind_of_step_is_stuck(): void
    {
        $request = $this->submitComputer();

        // One approver who has left
        $this->resign($this->sup);
        $this->assertSame('left', $this->approvalRow($request, 1)['blocked']);

        // A group nobody in it can sign in to
        $this->managerRungAsGroup($request, [$this->mgr->id]);
        $this->assertSame('no_account', $this->approvalRow($request, 2)['blocked']);

        // A group everyone in it has left
        $this->resign($this->mgr);
        $this->assertSame('left', $this->approvalRow($request, 2)['blocked']);

        // The list reads the same rows the same way
        $listed = collect($this->actingAs($this->requester)->getJson('/api/service-requests?scope=mine')->assertOk()->json('data'))
            ->firstWhere('id', $request->id);
        $this->assertSame(['left', 'left'], collect($listed['approvals'])->whereIn('position', [1, 2])->pluck('blocked')->all());
    }

    public function test_the_approvals_report_flags_a_stuck_group_step(): void
    {
        $request = $this->submitComputer();
        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve", $this->decision($request))->assertOk();
        $this->managerRungAsGroup($request, [$this->mgr->id]);
        $this->resign($this->mgr);

        $steps = ApprovalFacts::waitingSteps([], now()->subMonth(), now());

        $this->assertCount(1, $steps);
        $this->assertSame('left', ApprovalFacts::blockedBecause($steps->first()));
    }
}
