<?php

namespace Tests\Feature;

use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Employee detail's Requests tab: an Employee-module "peek" at the service requests
 * one person owns. Ownership spans two columns (`employee_id` for requests filed FOR them,
 * `user_id` for requests they filed themselves), and explicitly excludes the ones they only
 * submitted on somebody else's behalf.
 */
class EmployeeRequestsTest extends TestCase
{
    use RefreshDatabase;

    /** Seed each role's default permissions into role_permissions (mirrors DatabaseSeeder). */
    protected function seedDefaultPermissions(): void
    {
        foreach (Permissions::defaults() as $roleKey => $granted) {
            $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey)])->id;
            foreach ($granted as $permission) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true],
                );
            }
        }
    }

    /** @param  array<string, mixed>  $overrides */
    private function request(string $reference, array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'reference' => $reference,
            'type' => RequestType::Software->value,
            'origin' => RequestOrigin::Direct->value,
            'requester_name' => 'Somebody',
            'title' => 'Request: Software',
            'reason' => 'Needed for the job.',
            'status' => RequestStatus::Pending->value,
            'fields' => [],
        ], $overrides));
    }

    public function test_lists_requests_the_employee_filed_and_requests_filed_for_them(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $employee = Employee::create(['first_name' => 'Ann', 'last_name' => 'Owner']);
        $account = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);

        // Owned through the account alone: `employee_id` is nulled if the employee row it
        // pointed at ever goes away, and the request still belongs to whoever filed it.
        $this->request('RQ-2026-0001', ['user_id' => $account->id]);
        // Filed by HR on their first day, before the login existed.
        $this->request('RQ-2026-0002', [
            'type' => RequestType::Computer->value,
            'origin' => RequestOrigin::Onboarding->value,
            'employee_id' => $employee->id,
        ]);

        $this->getJson("/api/employees/{$employee->id}/requests")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            // Newest first: both rows were created in this test, so the second one leads.
            ->assertJsonPath('data.0.reference', 'RQ-2026-0002')
            ->assertJsonPath('data.0.origin', 'onboarding')
            ->assertJsonPath('data.0.type', 'computer')
            ->assertJsonPath('data.1.reference', 'RQ-2026-0001')
            ->assertJsonPath('data.1.status', 'pending');
    }

    public function test_excludes_other_peoples_requests_and_ones_this_employee_only_submitted(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $hr = Employee::create(['first_name' => 'Hana', 'last_name' => 'Resources']);
        $hrAccount = User::factory()->create(['role' => 'hr', 'employee_id' => $hr->id]);
        $newHire = Employee::create(['first_name' => 'Nate', 'last_name' => 'Newbie']);

        // HR pressed Save, but the request belongs to the new hire — it shows on THEIR tab.
        $this->request('RQ-2026-0003', [
            'origin' => RequestOrigin::Onboarding->value,
            'employee_id' => $newHire->id,
            'submitted_by_user_id' => $hrAccount->id,
            'submitted_by_name' => $hr->name,
        ]);

        $this->getJson("/api/employees/{$hr->id}/requests")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson("/api/employees/{$newHire->id}/requests")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reference', 'RQ-2026-0003');
    }

    /** The endpoint is an Employee-module "peek" — employees.view alone is enough, no request permission needed. */
    public function test_requires_only_employees_view(): void
    {
        $role = Role::firstOrCreate(['key' => 'hr_viewer'], ['name' => 'HR Viewer']);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'employees.view'], ['allowed' => true]);
        $this->actingAs(User::factory()->create(['role' => 'hr_viewer']));
        $employee = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $this->getJson("/api/employees/{$employee->id}/requests")->assertOk();
    }

    /** Without employees.view the endpoint is forbidden. */
    public function test_forbidden_without_employees_view(): void
    {
        Role::firstOrCreate(['key' => 'no_perms'], ['name' => 'No Perms']);
        $this->actingAs(User::factory()->create(['role' => 'no_perms']));
        $employee = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $this->getJson("/api/employees/{$employee->id}/requests")->assertForbidden();
    }
}
