<?php

// The Requests list search finds the requester's Thai name, code and department.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;

    private int $created = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['key' => 'viewer'], ['name' => 'viewer', 'color' => '#64748b', 'is_system' => false]);
        foreach (['requests.module', 'requests.view_all'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }
        $this->viewer = User::factory()->create(['role' => 'viewer']);
    }

    private function filedBy(?Employee $employee): ServiceRequest
    {
        $this->created++;

        return ServiceRequest::create([
            'reference' => sprintf('RQ-2026-%04d', $this->created), 'type' => 'computer', 'origin' => 'direct',
            'employee_id' => $employee?->id, 'requester_name' => 'Someone', 'title' => 'Request',
            'reason' => 'Needed for work.', 'status' => 'pending',
        ]);
    }

    /** @return list<string> */
    private function references(string $search): array
    {
        $response = $this->actingAs($this->viewer)->getJson('/api/service-requests?per_page=100&search='.urlencode($search))->assertOk();

        return array_column($response->json('data'), 'reference');
    }

    public function test_search_finds_requester_thai_name_code_and_department(): void
    {
        $accounting = Department::create(['code' => 'DEP-AC', 'tag' => 'AC', 'name' => 'Accounting', 'name_th' => 'บัญชี']);
        $wipa = Employee::create(['code' => 'EMP-W1', 'first_name' => 'Wipa', 'last_name' => 'Dee', 'first_name_th' => 'วิภา', 'last_name_th' => 'ดี', 'department_id' => $accounting->id]);
        $hit = $this->filedBy($wipa);
        $other = Department::create(['code' => 'DEP-OT', 'tag' => 'OT', 'name' => 'Operations', 'name_th' => 'ปฏิบัติการ']);
        $this->filedBy(Employee::create(['code' => 'EMP-Z9', 'first_name' => 'Zed', 'department_id' => $other->id]));

        foreach (['วิภา', 'EMP-W1', 'บัญชี', 'Accounting', 'Wipa บัญชี'] as $search) {
            $this->assertSame([$hit->reference], $this->references($search), $search);
        }
    }

    public function test_requester_without_thai_name_is_found_by_english_name_and_code(): void
    {
        $hit = $this->filedBy(Employee::create(['code' => 'EMP-N5', 'first_name' => 'Nattha', 'last_name' => 'Lee']));
        $this->filedBy(Employee::create(['code' => 'EMP-Z9', 'first_name' => 'Zed']));

        $this->assertSame([$hit->reference], $this->references('Nattha'));
        $this->assertSame([$hit->reference], $this->references('EMP-N5'));
    }

    public function test_search_finds_the_department_name_stored_on_the_request(): void
    {
        $hit = $this->filedBy(null);
        $hit->forceFill(['department_name' => 'Warehouse North'])->save();
        $this->filedBy(null);

        $this->assertSame([$hit->reference], $this->references('Warehouse'));
    }
}
