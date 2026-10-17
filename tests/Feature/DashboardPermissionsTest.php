<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Dashboard's own section switches: catalog and role defaults. */
class DashboardPermissionsTest extends TestCase
{
    use RefreshDatabase;

    /** The right that showed each section before the switches existed. */
    private const FROM = [
        'tickets.view_all' => 'dashboard.view_it',
        'requests.view_all' => 'dashboard.view_requests',
        'contracts.module' => 'dashboard.view_contracts',
        'employees.view_dashboard' => 'dashboard.view_hr',
        'system.view_audit' => 'dashboard.view_activity',
    ];

    public function test_the_catalog_lists_the_five_switches(): void
    {
        $this->assertSame(
            ['view_it', 'view_requests', 'view_contracts', 'view_hr', 'view_activity'],
            Permissions::catalog()['dashboard'],
        );
    }

    public function test_role_defaults_grant_a_switch_exactly_when_they_grant_its_source_right(): void
    {
        foreach (Permissions::defaults() as $role => $keys) {
            foreach (self::FROM as $source => $switch) {
                $this->assertSame(in_array($source, $keys, true), in_array($switch, $keys, true), "{$role}: {$switch}");
            }
        }
    }
}
