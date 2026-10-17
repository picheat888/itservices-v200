<?php

// The sidebar badge for Requests must equal the two counts the list page shows: waiting on me plus the IT queue.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestBadgeParityTest extends TestCase
{
    use RefreshDatabase;

    private function approver(array $permissions): User
    {
        $department = Department::create(['code' => 'DEP-PB', 'tag' => 'PB', 'name' => 'Parity']);
        $employee = Employee::create(['first_name' => 'Approver', 'department_id' => $department->id, 'status' => 'active']);
        $role = Role::firstOrCreate(['key' => 'parity'], ['name' => 'parity', 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => 'parity', 'employee_id' => $employee->id]);
    }

    private function request(string $status, ?User $approver = null): ServiceRequest
    {
        $asker = Employee::create(['first_name' => 'Asker', 'status' => 'active']);
        $request = ServiceRequest::create([
            'type' => 'computer', 'employee_id' => $asker->id, 'requester_name' => 'Asker',
            'title' => 'Laptop', 'reason' => 'Parity', 'status' => $status,
        ]);
        if ($approver !== null) {
            $request->approvals()->create([
                'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval', 'label' => 'Manager',
                'approver_employee_id' => $approver->employee_id, 'approver_name' => 'Approver', 'status' => 'current',
            ]);
        }

        return $request;
    }

    public function test_the_badge_is_waiting_on_me_plus_the_it_queue_and_each_has_its_own_list(): void
    {
        $user = $this->approver(['requests.module', 'requests.view_all', 'requests.complete']);
        $this->request('pending', $user);
        $this->request('approved');
        $this->request('approved');
        $this->request('completed');

        $badge = $this->actingAs($user)->getJson('/api/sidebar-badges')->assertOk()->json('data.requests');
        $meta = $this->actingAs($user)->getJson('/api/service-requests')->assertOk()->json('meta');

        $this->assertSame(3, $badge);
        $this->assertSame($badge, $meta['awaiting_me'] + $meta['to_complete']);
        $this->assertSame($meta['awaiting_me'], $this->actingAs($user)->getJson('/api/service-requests?scope=approvals')->json('meta.total'));
        $this->assertSame($meta['to_complete'], $this->actingAs($user)->getJson('/api/service-requests?scope=queue')->json('meta.total'));
    }

    public function test_without_the_completion_right_the_badge_is_only_what_waits_on_me(): void
    {
        $user = $this->approver(['requests.module', 'requests.view_all']);
        $this->request('pending', $user);
        $this->request('approved');

        $badge = $this->actingAs($user)->getJson('/api/sidebar-badges')->assertOk()->json('data.requests');
        $meta = $this->actingAs($user)->getJson('/api/service-requests')->assertOk()->json('meta');

        $this->assertSame(1, $badge);
        $this->assertSame(0, $meta['to_complete']);
        $this->assertSame($badge, $meta['awaiting_me'] + $meta['to_complete']);
    }
}
