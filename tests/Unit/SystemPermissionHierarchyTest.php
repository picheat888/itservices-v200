<?php

// Unit tests for the system.* (Permissions screen) master switch normalization.

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class SystemPermissionHierarchyTest extends TestCase
{
    public function test_normalize_drops_every_system_key_when_the_master_is_off(): void
    {
        $out = Permissions::normalizeSystem(['system.manage_roles', 'system.manage_groups', 'system.view_audit', 'tickets.create']);

        $this->assertSame(['tickets.create'], $out);
    }

    public function test_normalize_keeps_the_children_when_the_master_is_on(): void
    {
        $in = ['system.manage_permissions', 'system.manage_groups', 'system.view_audit', 'tickets.create'];

        $this->assertSame($in, Permissions::normalizeSystem($in));
    }

    public function test_default_grants_are_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $this->assertEqualsCanonicalizing($granted, Permissions::normalizeSystem($granted), "{$role} defaults hold a system key without its master");
        }
    }
}
