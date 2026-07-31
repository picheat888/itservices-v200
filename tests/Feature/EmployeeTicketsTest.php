<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeTicketsTest extends TestCase
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

    /** @return array<string, mixed> */
    private function ticketRow(Employee $e, string $subject): array
    {
        return [
            'subject' => $subject,
            'description' => 'desc',
            'category' => 'hardware',
            'status' => 'open',
            'requester_id' => $e->id,
        ];
    }

    public function test_employee_tickets_endpoint_lists_only_that_employees_tickets(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $other = Employee::create(['first_name' => 'C', 'last_name' => 'D']);
        Ticket::create($this->ticketRow($e, 'Broken laptop'));
        Ticket::create($this->ticketRow($other, 'Not mine'));

        $this->getJson("/api/employees/{$e->id}/tickets")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject', 'Broken laptop')
            ->assertJsonPath('data.0.status', 'open')
            ->assertJsonPath('data.0.category', 'hardware')
            ->assertJsonPath('data.0.ticket_no', fn ($no) => is_string($no) && str_starts_with($no, 'TKT-'));
    }

    /** The endpoint is an Employee-module "peek" — employees.view alone is enough, no ticket permission needed. */
    public function test_employee_tickets_endpoint_requires_only_employees_view(): void
    {
        $role = Role::firstOrCreate(['key' => 'hr_viewer'], ['name' => 'HR Viewer']);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'employees.view'], ['allowed' => true]);
        $this->actingAs(User::factory()->create(['role' => 'hr_viewer']));
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $this->getJson("/api/employees/{$e->id}/tickets")->assertOk();
    }

    /** Without employees.view the endpoint is forbidden. */
    public function test_employee_tickets_endpoint_forbidden_without_employees_view(): void
    {
        Role::firstOrCreate(['key' => 'no_perms'], ['name' => 'No Perms']);
        $this->actingAs(User::factory()->create(['role' => 'no_perms']));
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $this->getJson("/api/employees/{$e->id}/tickets")->assertForbidden();
    }
}
