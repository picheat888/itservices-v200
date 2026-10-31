<?php

// What the request list shows must match what a link opens, and the "waiting on me" tab must match its count.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestVisibilityParityTest extends TestCase
{
    use RefreshDatabase;

    private int $created = 0;

    /** @param  list<string>  $permissions */
    private function userWith(string $roleKey, array $permissions, ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(['key' => $roleKey], ['name' => $roleKey, 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::firstOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    private function filed(string $status, ?User $owner = null): ServiceRequest
    {
        $this->created++;

        return ServiceRequest::create([
            'reference' => sprintf('RQ-2026-%04d', $this->created), 'type' => 'computer', 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => 'Request', 'reason' => 'Needed for work.', 'status' => $status,
            'user_id' => $owner?->id,
        ]);
    }

    public function test_a_complete_holder_opens_by_link_only_what_the_list_shows_them(): void
    {
        $closer = $this->userWith('closer', ['requests.module', 'requests.complete']);
        $listed = [];
        foreach (['pending', 'approved', 'rejected', 'completed', 'cancelled'] as $status) {
            $request = $this->filed($status);
            $listed[$status] = $request;
        }

        $inList = collect($this->actingAs($closer)->getJson('/api/service-requests?per_page=100')->assertOk()->json('data'))->pluck('id')->all();

        foreach ($listed as $status => $request) {
            $expected = in_array($request->id, $inList, true) ? 200 : 403;
            $this->actingAs($closer)->getJson("/api/service-requests/{$request->id}")->assertStatus($expected);
        }
        $this->assertEqualsCanonicalizing([$listed['approved']->id, $listed['completed']->id], $inList);
    }

    public function test_a_complete_holder_still_opens_a_pending_request_they_filed(): void
    {
        $closer = $this->userWith('closer', ['requests.module', 'requests.complete']);
        $own = $this->filed('pending', $closer);

        $this->actingAs($closer)->getJson("/api/service-requests/{$own->id}")->assertOk();
    }

    public function test_the_waiting_on_me_tab_holds_approval_steps_only_like_its_count(): void
    {
        $employee = Employee::create(['first_name' => 'Named', 'status' => 'active']);
        $user = $this->userWith('member', ['requests.module'], $employee);

        $approval = $this->filed('pending');
        $approval->approvals()->create([
            'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval', 'label' => 'Manager',
            'approver_employee_id' => $employee->id, 'approver_name' => 'Named', 'status' => 'current',
        ]);
        $completion = $this->filed('approved');
        $completion->approvals()->create([
            'position' => 2, 'actor_type' => 'it_staff', 'kind' => 'completion', 'label' => 'IT',
            'approver_employee_id' => $employee->id, 'approver_name' => 'Named', 'status' => 'current',
        ]);

        $tab = $this->actingAs($user)->getJson('/api/service-requests?scope=approvals')->assertOk();

        $this->assertSame([$approval->id], collect($tab->json('data'))->pluck('id')->all());
        $this->assertSame($tab->json('meta.total'), $tab->json('meta.awaiting_me'));
    }
}
