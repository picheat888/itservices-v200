<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class EmployeePermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_25_employee_keys(): void
    {
        $expected = [
            'employees.module', 'employees.view_dashboard', 'employees.view',
            'employees.add', 'employees.import', 'employees.edit', 'employees.reset_password',
            'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
            'employees.view_section', 'employees.section_add', 'employees.section_edit', 'employees.section_delete',
            'employees.view_department', 'employees.department_add', 'employees.department_edit', 'employees.department_delete',
            'employees.view_position', 'employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special',
            'employees.view_org', 'employees.edit_own',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $empKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'employees.'));
        $this->assertCount(25, $empKeys);
    }

    public function test_normalize_drops_child_when_its_view_is_off(): void
    {
        // section_add's parent view_section is absent -> dropped; add's parent view IS present -> kept
        $in = ['employees.module', 'employees.view', 'employees.add', 'employees.section_add'];
        $out = Permissions::normalizeEmployees($in);
        $this->assertContains('employees.add', $out);
        $this->assertNotContains('employees.section_add', $out);
    }

    public function test_normalize_drops_all_but_edit_own_when_master_is_off(): void
    {
        $in = ['employees.view', 'employees.add', 'employees.edit_own', 'tickets.create'];
        $out = Permissions::normalizeEmployees($in);
        $this->assertNotContains('employees.view', $out);
        $this->assertNotContains('employees.add', $out);
        $this->assertContains('employees.edit_own', $out); // standalone survives master-off
        $this->assertContains('tickets.create', $out);     // non-employee untouched
    }

    public function test_edit_own_is_not_a_child_of_any_group(): void
    {
        $h = Permissions::employeeHierarchy();
        $this->assertContains('employees.edit_own', $h['standalone']);
        foreach ($h['groups'] as $children) {
            $this->assertNotContains('employees.edit_own', $children);
        }
    }

    public function test_default_grants_are_employee_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $normalized = Permissions::normalizeEmployees($granted);
            $before = array_values(array_filter($granted, fn ($k) => str_starts_with($k, 'employees.')));
            $after = array_values(array_filter($normalized, fn ($k) => str_starts_with($k, 'employees.')));
            sort($before);
            sort($after);
            $this->assertSame($before, $after, "employee defaults for {$role} are not hierarchy-consistent");
        }
    }

    public function test_admin_and_hr_defaults_include_module_and_view_groups(): void
    {
        foreach (['admin', 'hr'] as $role) {
            $g = Permissions::defaults()[$role];
            $this->assertContains('employees.module', $g, "{$role} missing module");
            $this->assertContains('employees.view_dashboard', $g);
            $this->assertContains('employees.view_org', $g);
        }
        // Org CRUD stays super-only: not granted to admin/hr by default.
        $this->assertNotContains('employees.section_add', Permissions::defaults()['admin']);
        $this->assertNotContains('employees.position_delete', Permissions::defaults()['hr']);
    }
}
