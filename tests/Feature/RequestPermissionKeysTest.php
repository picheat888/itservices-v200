<?php

// Request permission keys over HTTP: the module key opens the list, filing is per type, cancel_any cancels others' requests.

namespace Tests\Feature;

use App\Enums\Request\RequestStatus;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Notifications\RequestWorkflowNotification;
use App\Services\Sidebar\SidebarBadgeService;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsRequestFiling;
use Tests\TestCase;

class RequestPermissionKeysTest extends TestCase
{
    use GrantsRequestFiling;
    use RefreshDatabase;

    private Employee $staff;

    private User $requester;

    private User $supUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        // staff → sup → mgr; the approvers hold the module key only
        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $this->positionId('Manager')]);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $mgr->id, 'position_id' => $this->positionId('Supervisor')]);
        $this->staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $this->positionId('Staff/Officer')]);

        $this->requester = $this->makeUser('filer', self::requestFiler(), $this->staff);
        $this->supUser = $this->makeUser('approver', ['requests.module'], $sup);
        $this->makeUser('approver', [], $mgr);
    }

    /** A user on the given role key, with the role granted exactly the listed permissions. */
    private function makeUser(string $roleKey, array $permissions = [], ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    private function positionId(string $title): int
    {
        return Position::where('title', $title)->firstOrFail()->id;
    }

    /** @return array<string, mixed> */
    private function computerPayload(): array
    {
        $deviceId = (int) RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->value('id');

        return [
            'type' => 'computer',
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $deviceId, 'qty' => 1],
        ];
    }

    private function submitComputer(): ServiceRequest
    {
        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', $this->computerPayload())->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    /** A request this test's approvers have nothing to do with. */
    private function unrelatedRequest(): ServiceRequest
    {
        return ServiceRequest::create([
            'type' => 'computer', 'requester_name' => 'Elsewhere', 'title' => 'Laptop',
            'reason' => 'Somebody else entirely.', 'status' => 'pending',
        ]);
    }

    /** Another staff member on the same reporting line. */
    private function colleague(): Employee
    {
        return Employee::create(['first_name' => 'Colleague', 'manager_id' => $this->staff->manager_id, 'position_id' => $this->staff->position_id]);
    }

    /** A view_all holder, with or without the right to cancel others' requests. */
    private function itUser(bool $cancelAny = true): User
    {
        $keys = ['requests.module', 'requests.view_all', ...($cancelAny ? ['requests.cancel_any'] : [])];

        return $this->makeUser($cancelAny ? 'it_cancel' : 'it_view', $keys);
    }

    // Module key opens the list

    public function test_the_list_needs_the_module_key(): void
    {
        $this->actingAs($this->makeUser('no_module', ['requests.submit', 'requests.view_all', 'requests.complete']))
            ->getJson('/api/service-requests')->assertForbidden();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/service-requests')->assertOk();
    }

    public function test_a_module_only_approver_lists_only_what_they_take_part_in(): void
    {
        $request = $this->submitComputer();
        $this->unrelatedRequest();

        $response = $this->actingAs($this->supUser)->getJson('/api/service-requests')->assertOk();

        $this->assertSame([$request->id], array_column($response->json('data'), 'id'));
        $this->assertSame(1, $response->json('meta.awaiting_me'));
        // No right to file: the wizard's options and the submit itself stay closed.
        $this->actingAs($this->supUser)->getJson('/api/service-requests/options')->assertForbidden();
        $this->actingAs($this->supUser)->postJson('/api/service-requests', $this->computerPayload())->assertForbidden();
    }

    public function test_a_module_only_approver_gets_a_badge_for_the_step_waiting_on_them(): void
    {
        $this->submitComputer();

        $this->assertSame(1, app(SidebarBadgeService::class)->forUser($this->supUser->fresh())['requests']);
        $this->assertSame(1, $this->actingAs($this->supUser)->getJson('/api/sidebar-badges')->assertOk()->json('data.requests'));
    }

    // Per-type filing

    public function test_filing_a_type_needs_that_type_key(): void
    {
        RolePermission::where('role_id', $this->requester->role_id)->where('permission', 'requests.submit_computer')->delete();

        $this->actingAs($this->requester)->postJson('/api/service-requests', $this->computerPayload())->assertForbidden();
        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_filing_a_type_the_user_holds_is_created(): void
    {
        $user = $this->makeUser('computer_only', ['requests.module', 'requests.submit', 'requests.submit_computer'], $this->colleague());

        $this->actingAs($user)->postJson('/api/service-requests', $this->computerPayload())->assertCreated();
    }

    public function test_a_type_key_without_submit_files_nothing(): void
    {
        $user = $this->makeUser('type_only', ['requests.module', 'requests.submit_computer'], $this->colleague());

        $this->actingAs($user)->postJson('/api/service-requests', $this->computerPayload())->assertForbidden();
    }

    public function test_an_unknown_or_missing_type_is_still_a_validation_error(): void
    {
        $this->actingAs($this->requester)->postJson('/api/service-requests', [...$this->computerPayload(), 'type' => 'teleporter'])
            ->assertUnprocessable()->assertJsonValidationErrors('type');

        $payload = $this->computerPayload();
        unset($payload['type']);
        $this->actingAs($this->requester)->postJson('/api/service-requests', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('type');
    }

    public function test_the_options_list_only_the_types_the_user_may_file(): void
    {
        $user = $this->makeUser('two_types', ['requests.module', 'requests.submit', 'requests.submit_cctv', 'requests.submit_computer']);

        $types = $this->actingAs($user)->getJson('/api/service-requests/options')->assertOk()->json('data.types.*.type');

        $this->assertSame(['computer', 'cctv'], $types);
    }

    public function test_the_options_answer_an_empty_list_when_no_type_is_granted(): void
    {
        $user = $this->makeUser('no_types', ['requests.module', 'requests.submit']);

        $this->actingAs($user)->getJson('/api/service-requests/options')
            ->assertOk()
            ->assertJsonPath('data.types', []);
    }

    // Cancel others' requests

    public function test_cancel_any_cancels_a_pending_request_it_does_not_own(): void
    {
        $request = $this->submitComputer();
        $it = $this->itUser();

        $this->actingAs($it)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()->assertJsonPath('data.can_cancel', true);

        $this->actingAs($it)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'The requester has left.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancelled_by', $it->name)
            ->assertJsonPath('data.can_cancel', false);

        $fresh = $request->fresh();
        $this->assertSame(RequestStatus::Cancelled, $fresh->status);
        $this->assertSame($it->id, $fresh->cancelled_by_user_id);
        $this->assertSame($it->name, $fresh->cancelled_by_name);

        $log = AuditLog::where('action', 'Cancelled service request')->sole();
        $this->assertSame($it->id, $log->user_id);
        $this->assertSame("{$request->reference} (for the owner)", $log->target);

        // The waiting approver hears who cancelled, not "the requester"
        $bell = $this->latestRequestBell($this->supUser);
        $this->assertSame('cancelled_for_owner', $bell['subtype']);
        $this->assertSame($it->name, $bell['actor_name']);
    }

    public function test_the_owner_cancelling_is_logged_without_the_note(): void
    {
        $request = $this->submitComputer();

        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'No longer needed.'])->assertOk();

        $this->assertSame($request->reference, AuditLog::where('action', 'Cancelled service request')->sole()->target);
        $this->assertSame('cancelled', $this->latestRequestBell($this->supUser)['subtype']);
    }

    /** @return array<string, mixed> */
    private function latestRequestBell(User $user): array
    {
        return $user->notifications()->where('type', RequestWorkflowNotification::class)->latest('updated_at')->firstOrFail()->data;
    }

    public function test_seeing_every_request_is_not_the_right_to_cancel_one(): void
    {
        $request = $this->submitComputer();
        $viewer = $this->itUser(cancelAny: false);

        $this->actingAs($viewer)->getJson("/api/service-requests/{$request->id}")
            ->assertOk()->assertJsonPath('data.can_cancel', false);
        $this->actingAs($viewer)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'Trying anyway.'])->assertForbidden();
        $this->assertSame(RequestStatus::Pending, $request->fresh()->status);
    }

    public function test_cancel_any_on_a_request_no_longer_pending_answers_like_the_owner_does(): void
    {
        $request = $this->submitComputer();
        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'No longer needed.'])->assertOk();
        $it = $this->itUser();

        $this->actingAs($it)->getJson("/api/service-requests/{$request->id}")->assertJsonPath('data.can_cancel', false);
        $this->actingAs($it)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'Again.'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/cancel", ['reason' => 'Again.'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame($this->requester->id, $request->fresh()->cancelled_by_user_id);
    }
}
